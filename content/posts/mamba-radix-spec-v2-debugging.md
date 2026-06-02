+++
title = "发现 Mamba 问题后的定位过程"
date = 2026-06-02
description = "一次 SGLang Mamba scheduler、radix cache、spec v2 与 overlap 组合问题的定位记录。"
tags = ["SGLang", "Mamba", "Radix Cache", "Speculative Decoding", "问题定位"]
draft = false
+++

这篇记录一次 Mamba 相关问题的发现与定位过程：现象最初出现在 SGLang 版本升级后，mamba scheduler strategy、radix cache、speculative decoding、overlap scheduler 之间的组合约束变得更明确；继续排查后，核心落在 Mamba recurrent state 与普通 attention KV cache 的差异上。

文中的本地源码路径、工作文档路径、镜像地址等环境信息已替换为 local 形式；Pod 名称按排障上下文保留。

## 发现的问题

本次问题首先是在 SGLang `0.5.10.post1` 的 Qwen35 397B mamba 服务上暴露的。多模态压力下，服务涉及以下因素叠加：

```text
Mamba recurrent state
Radix prefix cache
speculative decoding
SGLANG_ENABLE_SPEC_V2
overlap scheduler
mamba-scheduler-strategy
max_mamba_cache_size / max_running_requests
```

具体问题可以拆成三类：

| 问题 | 表现 | 后续定位 |
|---|---|---|
| mamba 空间不足 | 出现 `Not enough space for mamba cache` 或 `Not enough space for mamba ping pong idx` 这类风险 | 需要区分主 mamba slot 不足，还是 extra_buffer 的 ping-pong/track slot 不足 |
| 并发能力低于直觉 | `max_running_requests` 会同时受 DP 切分、token 容量估算、mamba slot ratio 约束 | 不是 tokenizer 数量或用户配置直接决定，而是多个上限取最小值 |
| 参数组合冲突 | 新版中 `no_buffer + radix + speculative decoding` 会被显式拦截 | radix 保存 mutable running state，在 spec/overlap 下不能保证 prefix state 稳定 |

最初看到的现象不是一个单纯的 CUDA OOM，也不是只把 `--mamba-full-memory-ratio` 从 `0.75` 调到 `1` 就能解释的问题。真正的问题是：**Mamba 的 cache 不是普通 attention KV cache，MambaRadixCache 要保存稳定的 recurrent state snapshot；一旦 speculative decoding 和 overlap scheduler 参与，`no_buffer + radix` 这种保存 mutable running state 的路径就不安全。**

这篇文档的主线是：

```text
0.5.10.post1 暴露 mamba/radix/spec/overlap 组合问题
-> 先解释 Mamba cache
-> 再解释 MambaRadixCache 与普通 RadixCache 的不同
-> 再解释 Spec 和 SGLANG_ENABLE_SPEC_V2 对 overlap 的影响
-> 再汇总本次问题为什么发生、代码计算在哪里
-> 最后把 0.5.9 为什么看起来没问题作为对照插曲
```

一个后续排查中的重要插曲是：我们回头看 `0.5.9` 线上 Pod，发现它虽然启动参数里没有显式写 `--disable-radix-cache`，但旧代码会在 `no_buffer + spec + radix` 下静默执行 `self.disable_radix_cache = True`。所以 `0.5.9` 看起来没问题，不代表它真的跑通了 `spec + no_buffer + radix enabled`，而是实际降级到了：

```text
spec + no_buffer + radix disabled
```

这不是本文主线，但它解释了版本对照时为什么容易误判。

## 定位结论

| 问题 | 结论 |
|---|---|
| 0.5.10 上问题的本质 | Mamba state 复用、radix prefix cache、spec/overlap 调度和 mamba slot 预算之间的组合问题 |
| `no_buffer + radix + spec` 为什么危险 | radix 会保存 mutable running mamba slot；spec/overlap 会让状态推进、验证、回滚、复用交错 |
| `extra_buffer` 的作用 | 把 running mamba slot 和 radix 需要保存的 stable snapshot slot 拆开 |
| ping-pong buffer 的作用 | overlap 打开时，用两个 track slot 轮换，避免同一个 snapshot slot 被同时读写 |
| 关闭 radix 后还有 ping-pong buffer 吗 | `no_buffer + --disable-radix-cache` 下没有 ping-pong track buffer，但仍有主 MambaPool |
| spec intermediate state 参与 slot 计算吗 | 参与显存预算，不参与 `mamba_pool.free_slots` 和 ping-pong slot 申请；会间接影响可用 `max_mamba_cache_size` |
| `SGLANG_ENABLE_SPEC_V2=1` 能解决 no_buffer/radix 冲突吗 | 不能；它主要打开 spec v2 overlap，不会自动改 mamba strategy，也不会自动关闭 radix |
| 0.5.9 为什么看起来好 | 旧代码静默关闭 radix，实际没有验证 `no_buffer + radix + spec` 的安全性 |

## 一、Mamba cache

### Mamba 和普通 attention KV 的根本差异

普通 Transformer attention 的 KV cache 是按 token/block 存的：

```text
token_1 -> KV block 1
token_2 -> KV block 2
token_3 -> KV block 3
```

prefix cache 命中时，只要找到 prefix 对应的 KV block indices，就能把后续请求接着算。

Mamba/SSM 不一样。Mamba 的核心是 recurrent state，每一步会把当前 state 原地推进到下一步。服务端保存的是：

```text
某个请求运行到某个 token 位置时的模型内部状态
```

而不是：

```text
每个 token 独立对应一份可拆分、可拼接的 KV block
```

因此 Mamba cache 更像 checkpoint：

```text
prefix -> recurrent state checkpoint
```

而普通 attention KV cache 更像 block list：

```text
prefix -> KV block indices
```

### MambaPool 和主 mamba slot

代码里，Mamba state 由 `MambaPool` 预分配。核心主状态包括：

| 状态 | 含义 | 代码 |
|---|---|---|
| `conv_state` | convolution/state-space 前端相关状态 | `local/sglang/python/sglang/srt/mem_cache/memory_pool.py:254` |
| `temporal_state` | SSM recurrent state | `local/sglang/python/sglang/srt/mem_cache/memory_pool.py:269` |

初始化时直接分配 tensor：

```python
conv_state = [
    torch.zeros(
        size=(num_mamba_layers, size + 1) + conv_shape,
        dtype=conv_dtype,
        device=device,
    )
]

temporal_state = torch.zeros(
    size=(num_mamba_layers, size + 1) + temporal_state_shape,
    dtype=ssm_dtype,
    device=device,
)
```

这意味着日志中看到的 mamba cache 显存是启动时按 `max_mamba_cache_size` 预分配出来的。后续请求只是从这个池子里申请 slot index。

一个 mamba slot 可以理解成：

```text
MambaPool 中保存一份完整 recurrent state 的位置
```

请求运行时会持有：

```text
req.mamba_pool_idx
```

这个 slot 是 mutable 的，会随着 prefill/decode 继续原地变化。

### spec intermediate state

如果开启 speculative decoding，MambaPool 还会额外分配 speculative intermediate state：

```python
if speculative_num_draft_tokens is not None:
    intermediate_ssm_state_cache = torch.zeros(...)
    intermediate_conv_window_cache = [torch.zeros(...)]
```

位置：

```text
local/sglang/python/sglang/srt/mem_cache/memory_pool.py:274
```

这部分用途是 target verify 过程中保存 draft token 的中间 Mamba 状态。它和 radix 的 ping-pong/track buffer 不是一回事。

可以把 Mamba 相关显存分成三类：

| 类别 | 代码对象 | 是否走 `mamba_pool.free_slots` | 用途 | 是否直接导致本次 ping-pong 错误 |
|---|---|---:|---|---|
| 主 mamba request slot | `req.mamba_pool_idx` | 是 | 保存请求当前 running recurrent state | 可能导致 `Not enough space for mamba cache` |
| radix/extra_buffer track slot | `req.mamba_ping_pong_track_buffer` | 是 | 给 radix 保存 stable snapshot | 可能导致 `Not enough space for mamba ping pong idx` |
| spec intermediate state | `intermediate_ssm`、`intermediate_conv_window` | 否 | 给 EAGLE/spec target verify 保存 draft token 中间状态 | 不会直接导致 ping-pong slot 错误 |

spec intermediate state 是 EAGLE/spec verify 的 scratch buffer。spec 一次会验证多个 draft token，Mamba state 在这些 draft step 上需要临时保存中间结果，最后根据 accepted token 数，把正确的中间状态写回主 running slot，或者在需要 prefix cache tracking 时写到 track slot。

所以它解决的问题是：

```text
target verify 中有多个 draft step
每个请求最终接受到哪一步不确定
需要先保存每一步的中间 Mamba state
验证完成后再把 accepted step 对应的 state 写回
```

它不是：

```text
prefix cache 的 stable snapshot
radix tree 节点上的 mamba_value
extra_buffer 的 ping-pong buffer
```

明确回答：

```text
spec intermediate state 参与显存预算，
但不参与 mamba_pool.free_slots 的 slot 申请，
也不是 ping-pong track slot。
```

证据一：`handle_max_mamba_cache()` 会先为 spec intermediate state 扣减剩余显存：

```python
mamba_state_intermediate_size = (
    config.mamba2_cache_params.mamba_cache_per_req
    * max_running_requests
    * server_args.speculative_num_draft_tokens
)
total_rest_memory = total_rest_memory - (
    mamba_state_intermediate_size / (1 << 30)
)
```

位置：

```text
local/sglang/python/sglang/srt/model_executor/model_runner_kv_cache_mixin.py:184
```

证据二：MambaPool 初始化时，主池大小是 `size`，spec intermediate 使用单独的 `spec_state_size`：

```python
MambaPool(
    size=mamba_size,
    spec_state_size=mamba_spec_state_size,
    ...
)
```

位置：

```text
local/sglang/python/sglang/srt/mem_cache/memory_pool.py:223
local/sglang/python/sglang/srt/model_executor/model_runner_kv_cache_mixin.py:443
```

证据三：中间状态不参与 Mamba state RDMA transfer，代码明确跳过：

```python
if field in ("intermediate_ssm", "intermediate_conv_window"):
    continue
```

位置：

```text
local/sglang/python/sglang/srt/mem_cache/memory_pool.py:395
```

所以，spec intermediate state 的影响路径是：

```text
spec 开启
-> 预留 intermediate state 显存
-> 剩余可分给主 MambaPool 和 full KV cache 的显存变少
-> 可能降低 max_mamba_cache_size 或 max_total_num_tokens
```

但它不是：

```text
每个请求从 mamba_pool.free_slots 里额外申请一个 ping-pong slot
```

因此在本次问题里要分清直接原因和间接影响：

| 问题 | spec intermediate state 的作用 |
|---|---|
| `no_buffer + radix + spec` 新版报错 | spec algorithm 本身参与这个合法性判断，但不是 intermediate buffer 导致 |
| `Not enough space for mamba ping pong idx` | 不是直接原因；直接原因是 `extra_buffer + radix + overlap` 需要 track slots |
| `max_mamba_cache_size` 变小 | 有间接影响；spec intermediate 会提前扣掉一部分可用显存 |
| `mamba_ratio=3/4/5` | 不参与；ratio 只看 radix、extra_buffer、overlap |

一句话总结：

```text
spec intermediate state 是 spec verify 的中间状态显存预算项；
它不会直接消耗 ping-pong track slot，
也不是本次 ping-pong 空间错误的直接原因。
```

## 二、Radix cache

### 普通 RadixCache

普通 attention 的 radix cache 可以理解为：

```text
radix tree 节点
  key: token prefix
  value: 这段 prefix 对应的 KV cache indices
```

因为普通 KV cache 是按 token/block 存的，所以 prefix 被拆成树上的多段后，后面的子树仍然可以继续复用对应 KV block。

这类 cache 的核心优势是：

```text
相同 prefix 的请求不用重复 prefill attention KV
```

### MambaRadixCache

MambaRadixCache 除了普通 `value`，还需要保存 mamba state：

```text
radix tree 节点
  value: 普通 attention KV indices
  mamba_value: 这个 prefix 对应的 mamba state slot
```

代码中 `TreeNode` 同时有：

```python
self.value: Optional[torch.Tensor] = None
self.mamba_value: Optional[torch.Tensor] = None
```

位置：

```text
local/sglang/python/sglang/srt/mem_cache/mamba_radix_cache.py:75
local/sglang/python/sglang/srt/mem_cache/mamba_radix_cache.py:76
```

关键差异是：**Mamba state 不能像普通 KV block 一样任意拆分。**

代码里 `_split_node()` 明确写了：

```python
new_node.mamba_value = None  # mamba cache can not be split
```

位置：

```text
local/sglang/python/sglang/srt/mem_cache/mamba_radix_cache.py:1086
```

因此 MambaRadixCache 不是“树上每个 token 都有完整 mamba state”。它只能在稳定边界保存 checkpoint。

### Mamba prefix 是怎么命中的

Mamba prefix 命中分成两层，不是一步完成：

```text
第一层：按 token prefix 在 radix tree 里走，找到 KV 能命中的最长路径。
第二层：在这条路径上，找到最近一个带 mamba_value 的节点，作为 Mamba state 可恢复的 checkpoint。
```

也就是说，MambaRadixCache 可能在 token 层面能匹配更长的 prefix，但 Mamba state 只能恢复到最近一个保存过 `mamba_value` 的稳定点。

请求进入时，`Req.adjust_max_prefix_ids()` 会拿请求的 token prefix 去查 tree cache：

```python
match_result = tree_cache.match_prefix(
    MatchPrefixParams(
        key=RadixKey(token_ids=token_ids, extra_key=self.extra_key),
        req=self,
        cow_mamba=cow_mamba,
    )
)
```

然后把命中结果写回请求：

```python
self.prefix_indices = match_result.device_indices
self.last_node = match_result.last_device_node
self.mamba_branching_seqlen = match_result.mamba_branching_seqlen
```

位置：

```text
local/sglang/python/sglang/srt/managers/schedule_batch.py:979
local/sglang/python/sglang/srt/managers/schedule_batch.py:987
```

`MambaRadixCache.match_prefix()` 的主流程是：

```python
key = self._match_pre_processor(params)
value, last_node, best_value_len = self._match_prefix_helper(key)
return self._match_post_processor(params, value, last_node, best_value_len)
```

位置：

```text
local/sglang/python/sglang/srt/mem_cache/mamba_radix_cache.py:475
```

真正关键的是 `_match_prefix_helper()`。它一边沿 radix tree 按 token 走，一边记录“最近一个有 `mamba_value` 的节点”：

```python
if node.mamba_value is not None:
    best_value_len = len(value)
    best_last_node = node
```

完全走完后，如果最后节点也有 `mamba_value`，也会更新 best：

```python
if node.mamba_value is not None:
    best_value_len = len(value)
    best_last_node = node
```

位置：

```text
local/sglang/python/sglang/srt/mem_cache/mamba_radix_cache.py:971
local/sglang/python/sglang/srt/mem_cache/mamba_radix_cache.py:974
local/sglang/python/sglang/srt/mem_cache/mamba_radix_cache.py:992
```

所以这里的 `best_last_node` 不是“token 最长匹配的最后节点”，而是：

```text
token 匹配路径上，最近一个带 mamba_value 的节点
```

这就是 Mamba prefix 命中的核心。

举个简化例子：

```text
请求 tokens: A B C D E F

radix tree 能按 token 匹配到:
A B C D E

但只有节点 A B C 上保存了 mamba_value
节点 A B C D E 没有 mamba_value
```

那么结果不是恢复到 `ABCDE`，而是：

```text
KV prefix 可以命中到 ABCDE
Mamba state 只能从 ABC 的 checkpoint 恢复
```

后续 `mamba_branching_seqlen` 会记录“token 层面本来可能继续命中，但缺少 mamba state 的分叉位置”。它的含义是：

```text
如果这里有 mamba state，本来可以作为更长的 Mamba prefix hit；
但现在没有，只能从最近的 mamba checkpoint 往后重算。
```

代码注释也说明它是：

```text
The mamba radix cache branching point, which is the longest page-aligned position
that could've been cache hit if there exists a mamba state.
```

位置：

```text
local/sglang/python/sglang/srt/mem_cache/base_prefix_cache.py:137
local/sglang/python/sglang/srt/mem_cache/mamba_radix_cache.py:1033
```

因此可以把 Mamba prefix hit 理解为：

```text
先用 token 找路
再用 mamba_value 判断这条路上哪里可以恢复 state
KV 可以命中更长
Mamba 只能命中到最近 checkpoint
checkpoint 之后需要继续 forward，把 mamba state 补到正确位置
```

### MambaRadixCache 命中后如何恢复

prefix 命中后，如果节点上有 `mamba_value`，会把 cache 中保存的 mamba state copy 到请求本地 running slot：

```python
src_index = last_node.mamba_value
dst_index = req.mamba_pool_idx.unsqueeze(0)
self.req_to_token_pool.mamba_pool.copy_from(src_index, dst_index)
```

位置：

```text
local/sglang/python/sglang/srt/mem_cache/mamba_radix_cache.py:1049
local/sglang/python/sglang/srt/mem_cache/mamba_radix_cache.py:1064
```

这说明 `mamba_value` 保存的是可以恢复 recurrent state 的 slot index，不是 token，也不是普通 KV block。

## 三、Spec 和 overlap

### Spec 是什么

Speculative decoding 的目标是加速 decode。简单说，它用 draft 模型或 draft 路径先猜多个 token，再用 target 模型验证这些 token。

流程可以概括为：

```text
draft 先生成多个候选 token
-> target 一次性验证这些 token
-> 接受一部分 token
-> 回滚或丢弃未接受 token
```

这对普通 attention KV cache 已经会带来 over-allocated KV、accepted token 移动等额外逻辑。对 Mamba 来说，它更敏感，因为 Mamba state 是原地推进的 recurrent state。spec 验证期间需要知道：

```text
每个请求最终接受到了哪一步
对应的 mamba state 应该停在哪一步
如果要写入 prefix cache，应该保存哪个稳定点
```

因此 spec 和 MambaRadixCache 的关系，不只是“多占一点显存”，而是会改变 mamba state 的推进和保存边界。

### SGLANG_ENABLE_SPEC_V2 是什么

`SGLANG_ENABLE_SPEC_V2` 不等于是否开启 speculative decoding。spec 是否开启由参数决定，例如：

```text
--speculative-algorithm EAGLE
```

`SGLANG_ENABLE_SPEC_V2=1` 主要控制 EAGLE/EAGLE3/STANDALONE 的 spec v2 overlap 路径：

```python
if (
    self.speculative_algorithm in ["EAGLE", "EAGLE3", "STANDALONE"]
    and envs.SGLANG_ENABLE_SPEC_V2.get()
):
    self.disable_overlap_schedule = False
else:
    self.disable_overlap_schedule = True
```

位置：

```text
local/sglang/python/sglang/srt/server_args.py:3010
```

所以：

| 配置 | 含义 |
|---|---|
| 有 `--speculative-algorithm EAGLE`，没有 `SGLANG_ENABLE_SPEC_V2=1` | spec 开启，但 spec v2 overlap 关闭 |
| 有 `--speculative-algorithm EAGLE`，且 `SGLANG_ENABLE_SPEC_V2=1` | spec 开启，spec v2 overlap 打开 |
| `SGLANG_ENABLE_SPEC_V2=1` + `no_buffer` + radix enabled | 仍然冲突 |
| `SGLANG_ENABLE_SPEC_V2=1` + `extra_buffer` + radix enabled | 新版建议的 spec + radix 路径 |

### 为什么 radix 需要 ping-pong

MambaRadixCache 需要保存稳定 snapshot。问题在于：

```text
running slot 会继续变化
radix 需要保存某个 prefix 边界的稳定状态
spec/overlap 会让 forward、verify、cache update 的时序交错
```

如果只有一个 track slot，在 overlap 场景下可能出现：

```text
上一轮 cache/radix 还在读 snapshot
下一轮 forward 已经想把新的 state 写进同一个 snapshot slot
```

因此 `extra_buffer + overlap` 下需要两个 track slot 轮换，也就是 ping-pong：

```python
self.mamba_ping_pong_track_buffer_size = 2 if enable_overlap_schedule else 1
```

位置：

```text
local/sglang/python/sglang/srt/mem_cache/memory_pool.py:544
```

spec v2 里也会显式设置 `mamba_track_indices`，用于 Mamba prefix-cache state tracking：

```python
if get_global_server_args().enable_mamba_extra_buffer():
    batch.mamba_track_indices = torch.stack(
        [
            req.mamba_ping_pong_track_buffer[req.mamba_next_track_idx]
            for req in batch.reqs
        ]
    )
```

位置：

```text
local/sglang/python/sglang/srt/speculative/eagle_info_v2.py:235
```

验证后，spec v2 会根据接受 token 的位置计算是否跨过 mamba track interval，并通知 backend 更新 mamba state：

```python
self.target_worker.model_runner.attn_backend.update_mamba_state_after_mtp_verify(
    accepted_steps=accepted_steps,
    mamba_track_indices=batch.mamba_track_indices,
    mamba_steps_to_track=mamba_steps_to_track,
    model=self.target_worker.model_runner.model,
)
```

位置：

```text
local/sglang/python/sglang/srt/speculative/eagle_worker_v2.py:962
local/sglang/python/sglang/srt/speculative/eagle_worker_v2.py:994
```

这就是 spec、radix、ping-pong 三者的关系：

```text
spec 会让一次验证中推进多个候选 token
radix 需要保存某个 prefix 边界的稳定 mamba state
overlap 让读写时序可能交错
extra_buffer 提供 stable snapshot slot
ping-pong 提供两个 snapshot slot 轮换，避免读写冲突
```

## 四、mamba-scheduler-strategy

### no_buffer

`no_buffer` 下没有额外 snapshot buffer。radix 如果开启，保存的是当前请求的主 mamba slot：

```python
mamba_value = req.mamba_pool_idx.unsqueeze(-1).clone()
```

位置：

```text
local/sglang/python/sglang/srt/mem_cache/mamba_radix_cache.py:576
```

特点：

| 特点 | 说明 |
|---|---|
| 主 mamba slot | 有 |
| track buffer | 无 |
| radix 保存内容 | 直接保存主 mamba slot |
| 优点 | slot 消耗低，并发更高 |
| 风险 | radix 保存的是 mutable slot |
| 适合 | `--disable-radix-cache` 或无 spec/overlap 的保守场景 |

`no_buffer + radix + no spec` 可以通过关闭 overlap 降低风险；但 `no_buffer + radix + spec` 在新版中被禁止。

### extra_buffer

`extra_buffer` 的目的就是把：

```text
running slot
```

和：

```text
radix 要保存的 stable snapshot slot
```

拆开。

保存 mamba_value 时，radix 保存的是 ping-pong/track buffer 中的稳定 slot：

```python
if self.enable_mamba_extra_buffer:
    mamba_value = (
        req.mamba_ping_pong_track_buffer[
            mamba_ping_pong_track_buffer_to_keep
        ]
        .unsqueeze(-1)
        .clone()
    )
```

位置：

```text
local/sglang/python/sglang/srt/mem_cache/mamba_radix_cache.py:562
```

请求申请 track buffer 的地方：

```python
if self.enable_mamba_extra_buffer:
    req.mamba_ping_pong_track_buffer = self.mamba_pool.alloc(
        self.mamba_ping_pong_track_buffer_size
    )
```

位置：

```text
local/sglang/python/sglang/srt/mem_cache/memory_pool.py:619
```

特点：

| 特点 | 说明 |
|---|---|
| 主 mamba slot | 有 |
| track buffer | 有 |
| radix 保存内容 | stable snapshot slot |
| 优点 | 支持 spec/radix/overlap 的安全路径 |
| 代价 | 每个请求占用更多 mamba slot，并发下降 |

### 关闭 radix 后的关系

关闭 radix 后，prefix tree 不保存 mamba snapshot，因此 `extra_buffer` 没有消费者。

所以推荐关系是：

```text
disable radix -> no_buffer
enable radix + spec/overlap -> extra_buffer
```

## 五、本次问题汇总

### 问题一：为什么 0.5.10 会显式报错

新版代码禁止：

```text
no_buffer + radix enabled + speculative decoding
```

代码：

```python
elif not self.disable_radix_cache:  # no_buffer
    if self.speculative_algorithm is None:
        self.disable_overlap_schedule = True
    else:
        if not self.disable_radix_cache:
            raise ValueError(...)
```

位置：

```text
local/sglang/python/sglang/srt/server_args.py:2201
local/sglang/python/sglang/srt/server_args.py:2215
```

原因不是参数洁癖，而是这个组合的语义不安全：

```text
no_buffer 让 radix 保存主 running slot
spec 会让 state 推进、验证、接受、回滚交错
radix 需要稳定 prefix state
三者放在一起，radix 保存的 mamba state 不再可靠
```

### 问题二：为什么 extra_buffer 后并发下降

`extra_buffer` 会额外消耗 track slot。overlap 开启时需要两个 track slot。

`_calculate_mamba_ratio()` 会把这个反映到 `max_running_requests` 的计算中。本次最初出问题的旧逻辑是：

```python
def _calculate_mamba_ratio(self):
    if self.server_args.disable_radix_cache:
        return 1

    additional_ratio = 0
    if self.server_args.enable_mamba_extra_buffer():
        if not self.server_args.disable_overlap_schedule:
            additional_ratio = 2
        else:
            additional_ratio = 1

    return 3 + additional_ratio
```

位置：

```text
local/sglang/python/sglang/srt/model_executor/model_runner_kv_cache_mixin.py:373
```

但这只是其中一个上限。最终每个 DP worker 上的 running request 数量按下面几个值取最小：

```text
min(
  configured_max_running_requests // dp_size,
  estimated_from_token_capacity,
  max_mamba_cache_size // mamba_ratio
)
```

代码：

```python
max_num_reqs = self.server_args.max_running_requests
if max_num_reqs is not None:
    max_num_reqs = min(max_num_reqs // self.dp_size, estimated)

...

max_num_reqs = min(
    max_num_reqs, self.server_args.max_mamba_cache_size // ratio
)
```

位置：

```text
local/sglang/python/sglang/srt/model_executor/model_runner_kv_cache_mixin.py:853
```

这段旧逻辑的问题是：只要运行时 `disable_radix_cache=True`，就直接 `return 1`，后面的 `extra_buffer` 和 overlap ping-pong slot 完全没有参与容量核算。

本次 decode 服务虽然启动配置里未必显式写了 `--disable-radix-cache`，但 PD decode 会在参数处理阶段强制把 radix cache 关掉：

```python
def _handle_pd_disaggregation(self):
    if self.disaggregation_mode == "decode":
        self.disable_radix_cache = True
        logger.warning("KV cache is forced as chunk cache for decode server")
```

位置：

```text
local/sglang/python/sglang/srt/server_args.py:3252
```

所以这次历史场景要按运行时 `server_args.disable_radix_cache=True` 来理解，而不是只看启动参数有没有显式加 `--disable-radix-cache`。

先把 ratio 的含义讲清楚。这里的 ratio 不是吞吐性能倍率，而是 **一个 running request 需要预留多少份 mamba cache slot**。可以把 mamba cache slot 理解成车位：最终调度允许多少请求进入 running，要用总车位数除以每个请求需要的车位数。

正常 radix 场景下，`extra_buffer + overlap on` 应该按 `5` 计算：

```text
radix base = 3
extra_buffer + overlap on = 2
ratio = 3 + 2 = 5
```

其中 `radix base = 3` 是 radix cache 场景下为了 prefix/reuse 做的保守容量口径；`extra_buffer + overlap on = 2` 是每个请求额外需要两个 ping-pong/track slot，用来在 running state 原地变化时，给 radix/spec 保留稳定 snapshot。

旧逻辑下：

| 场景 | 旧 ratio | 结果 |
|---|---:|---|
| PD decode 强制 `disable_radix_cache=True` + `extra_buffer` + overlap on | 1 | 错误地把每个请求当成 1 个 mamba slot |
| 实际 mamba slot 消耗 | 3 | 1 个主 mamba state slot + 2 个 ping-pong track slots |
| radix enabled + no_buffer | 3 | prefix cache 场景的保守估算 |
| radix enabled + extra_buffer + overlap off | 4 | 3 + 1 个 track slot |
| radix enabled + extra_buffer + overlap on | 5 | 3 + 2 个 ping-pong track slots |

为什么 decode 是 `3`，而不是正常 radix 场景的 `5`？

因为 PD decode 在参数处理阶段会强制：

```text
disable_radix_cache = True
```

所以 decode 侧已经不是 radix enabled 场景，不需要 radix base 的 `3`。但是它仍然开启了：

```text
mamba_scheduler_strategy = extra_buffer
disable_overlap_schedule = False
```

也就是说，decode 侧真实需要的是：

```text
1 个主 mamba slot + 2 个 ping-pong track slot = 3
```

因此修复后的 decode ratio 应该是 `3`。本次 bug 的点不是“decode 应该算 5 却算成 3”，而是 **旧代码在 `disable_radix_cache=True` 时直接返回 1，连 extra_buffer + overlap 需要的两个 ping-pong slot 都没有算进去**。

所以 `max_running_requests=43` 不能只看一个公式，需要先确认命中的是哪个 cap。

例如，如果用户配置层给的是：

```text
configured_max_running_requests = 700
dp_size = 16
```

那么第一层 cap 就是：

```text
700 // 16 = 43
```

在本次最初的错误计算场景里，运行时日志同时满足：

```text
configured_max_running_requests = 700
dp_size = 16
max_mamba_cache_size = 43
mamba_scheduler_strategy = extra_buffer
disable_overlap_schedule = False
runtime disable_radix_cache = True
```

旧 ratio 直接返回 1，因此：

```text
configured cap = 700 // 16 = 43
mamba cap = 43 // 1 = 43
final max_running_requests = min(43, estimated, 43) = 43
```

这就是为什么当时 `43` 确实是错误 ratio 场景下拿到的最终 `max_running_requests`。

第一次修复后，ratio 变为：

```python
ratio = 1 if self.server_args.disable_radix_cache else 3
if self.server_args.enable_mamba_extra_buffer():
    if not self.server_args.disable_overlap_schedule:
        ratio += 2
    else:
        ratio += 1
```

对于本次 PD decode 路径：

```text
runtime disable_radix_cache = True
extra_buffer = True
overlap on
ratio = 1 + 2 = 3
mamba cap = 43 // 3 = 14
final max_running_requests = min(43, estimated, 14) = 14
```

这里的 `3` 不是 radix enabled 场景的 base ratio，而是 `disable_radix_cache=True` 时的真实每请求 mamba slot 消耗：1 个主 slot + 2 个 ping-pong track slots。若 radix enabled 且 `extra_buffer + overlap on`，对应 ratio 才是 `5`。

prefill 为什么不受本次错误影响？

需要特别注意：prefill 和 decode 计算 `max_running_requests` 用的是同一段 `_resolve_max_num_reqs()` 代码，不是两套公式。差异来自进入这段代码前的运行时参数和 mamba pool 大小来源。

```text
PD decode: _handle_pd_disaggregation() 强制 disable_radix_cache=True
PD prefill: 不会在这里强制关闭 radix cache
```

本次 prefill 参数是：

```text
--data-parallel-size 1
--tensor-parallel-size 8
--moe-dense-tp-size 1
--enable-dp-attention
```

代码里这里按 DP 切分，不按 TP 切分：

```text
configured cap = max_running_requests // dp_size
```

所以 prefill 不是：

```text
700 // tp_size = 700 // 8
```

也不是 decode 那个：

```text
700 // 16 = 43
```

而是：

```text
700 // 1 = 700
```

同时，如果 prefill 保持 radix enabled，并启用 `extra_buffer + overlap on`，它会走正常 radix ratio：

```text
ratio = 3 + 2 = 5
max_running_requests = min(700, estimated, max_mamba_cache_size // 5)
```

换句话说，prefill 会先把 mamba slot 按正确 ratio 折算成请求上限，再放请求进入 batch。假设 prefill 真的只有 43 个 mamba slot，那么它会得到：

```text
43 // 5 = 8
```

这表示最多放 8 个请求进入对应 DP worker 的 running/prefill 执行窗口，更多请求排队，而不是像旧 decode 那样把 43 个 slot 错当成 43 个请求容量。

所以这里可以用一句话概括：

```text
decode 的 bug 是把 43 个 mamba slot 当成 43 个 request；
prefill 没有拿到 decode 这个 43，也没有走 ratio=1，而是按 radix + extra_buffer + overlap 的 ratio=5 做上限。
```

这个结论只能说明 prefill 没有命中 decode 那个 `disable_radix_cache=True -> ratio=1` 的漏算路径。不能把它理解成 prefill 完全串行、完全不需要 ping-pong、或者 prefill 永远不会有 mamba slot 压力。prefill 侧只要启用 extra_buffer，也会分配 ping-pong/track buffer；只是本次线上异常主要在 decode 长时间持有 running 请求、transfer/prealloc 队列叠加时暴露。

### 问题三：spec intermediate state 到底怎么算

spec intermediate state 不在上面的 `mamba_ratio` 里，也不是 `mamba_pool.free_slots` 里的运行 slot。它的影响更早发生在显存预算阶段：

```python
mamba_state_intermediate_size = (
    config.mamba2_cache_params.mamba_cache_per_req
    * max_running_requests
    * server_args.speculative_num_draft_tokens
)
total_rest_memory = total_rest_memory - (
    mamba_state_intermediate_size / (1 << 30)
)
```

位置：

```text
local/sglang/python/sglang/srt/model_executor/model_runner_kv_cache_mixin.py:184
```

所以它的定位是：

| 问题 | 回答 |
|---|---|
| 是否参与显存预算 | 是 |
| 是否参与 `max_mamba_cache_size` 的剩余显存计算 | 是，先扣掉 intermediate memory |
| 是否参与 `_calculate_mamba_ratio()` | 否 |
| 是否从 `mamba_pool.free_slots` 按请求申请 | 否 |
| 是否是 ping-pong buffer | 否 |

### 问题四：为什么关闭 radix 后没有 ping-pong

ping-pong/track buffer 是为了给 MambaRadixCache 保存 stable snapshot。关闭 radix 后，不再保存 prefix tree，也不再需要 mamba snapshot。

因此：

```text
no_buffer + --disable-radix-cache
```

仍然有主 MambaPool，但没有 radix ping-pong/track buffer。

### 问题五：为什么 0.5.9 看起来好

这是对照插曲，不是主线。

线上旧版本 Pod：

```text
sglang-aliyun-pdlws-qwen35-397b-decode-0
```

参数看起来像：

```text
--speculative-algorithm EAGLE
--speculative-num-steps 3
--speculative-num-draft-tokens 4
# 未显式设置 --mamba-scheduler-strategy
# 未显式设置 --disable-radix-cache
```

因为 `mamba_scheduler_strategy=auto -> no_buffer`，表面上像：

```text
spec + no_buffer + radix enabled
```

但旧代码会静默关闭 radix：

```python
else:
    logger.warning(...)
    self.disable_radix_cache = True
```

Pod 内定位：

```text
/usr/local/lib/python3.12/dist-packages/sglang/srt/server_args.py:1766
/usr/local/lib/python3.12/dist-packages/sglang/srt/server_args.py:1769
```

所以 `0.5.9 good` 的真实含义是：

```text
旧版本实际跑在 spec + no_buffer + radix disabled
```

不是：

```text
旧版本证明 spec + no_buffer + radix enabled 安全
```

## 定位过程：参数总览

| 参数 | 控制对象 | 关键影响 |
|---|---|---|
| `--mamba-scheduler-strategy no_buffer` | mamba state 管理策略 | 不分配 track buffer；主 slot 原地变化；与 `radix + spec` 冲突 |
| `--mamba-scheduler-strategy extra_buffer` | mamba state 管理策略 | 为 radix 保存稳定 snapshot；会额外占 mamba slot |
| `--disable-radix-cache` | prefix cache 开关 | 关闭 prefix tree 和 mamba snapshot 复用；避开 `no_buffer + radix + spec` |
| `SGLANG_ENABLE_SPEC_V2=1` | spec v2 overlap | 打开 spec v2 overlap，不自动改 mamba strategy 或 radix |
| `--disable-overlap-schedule` | overlap scheduler | 关闭 overlap；extra_buffer 下 track slot 从 2 降为 1 |
| `--mamba-full-memory-ratio` | mamba/full KV 显存比例 | 影响 `max_mamba_cache_size`，不能解决不兼容组合 |
| `--max-mamba-cache-size` | mamba slot 总数 | 显式指定 MambaPool size，随后仍会被 ratio 转换成 running 上限 |
| `--max-running-requests` | 期望 running 上限 | 对 mamba 模型还会被 `max_mamba_cache_size // mamba_ratio` 压低 |

## 定位过程：行为矩阵

| mamba strategy | radix | spec | `SGLANG_ENABLE_SPEC_V2` | overlap | mamba slot / memory 模型 | 新版行为 | 说明 |
|---|---|---|---|---|---|---|---|
| `no_buffer` | disabled | off | 无关 | 可开 | 约 1 个主 slot/request | 允许，但需避开其他 backend 限制 | 无 prefix 复用，slot 消耗最低 |
| `no_buffer` | disabled | on | `0` 或未设 | spec 逻辑关闭 overlap | 主 slot + spec intermediate memory | 允许，但需避开 FlashInfer GDN decode 限制 | 旧版本 Pod 静默降级后接近此组合 |
| `no_buffer` | disabled | on | `1` | spec v2 overlap 打开 | 主 slot + spec intermediate memory | 允许，但需避开 FlashInfer GDN decode 限制 | 没有 radix 保存 mutable mamba state |
| `no_buffer` | enabled | off | 无关 | 被关闭 | ratio=3 | 允许 | radix 直接持有主 mamba slot，靠关闭 overlap 降低风险 |
| `no_buffer` | enabled | on | `0` 或未设 | spec 逻辑关闭 overlap | ratio=3 + spec intermediate memory | 报错 | 新版禁止 `no_buffer + radix + spec` |
| `no_buffer` | enabled | on | `1` | spec v2 overlap 打开 | ratio=3 + spec intermediate memory | 报错 | spec v2 不能解决 mutable slot 问题 |
| `extra_buffer` | enabled | off | 无关 | 可开 | 主 slot + track slot | 允许 | radix 保存 stable snapshot |
| `extra_buffer` | enabled | on | `0` 或未设 | spec 逻辑关闭 overlap | ratio 通常 4 + spec intermediate memory | 可启动，但不是 spec v2 overlap 目标路径 | spec 开，但 v2 overlap 不开 |
| `extra_buffer` | enabled | on | `1` | spec v2 overlap 打开 | ratio 通常 5 + spec intermediate memory | 新版建议路径 | spec + radix + overlap 的目标组合 |
| `extra_buffer` | disabled | 任意 | 任意 | 任意 | 额外 track 没有消费者 | 报错或不建议 | 关闭 radix 后 extra_buffer 没有意义 |

## 最终建议配置

| 目标 | 推荐配置 | 原因 |
|---|---|---|
| 保留 radix，并使用 spec v2 overlap | `--mamba-scheduler-strategy extra_buffer` + `SGLANG_ENABLE_SPEC_V2=1` | radix 需要稳定 mamba snapshot，spec v2 overlap 需要 ping-pong track buffer |
| 追求最高 mamba 并发，接受无 prefix cache | `--mamba-scheduler-strategy no_buffer` + `--disable-radix-cache` | 每请求 mamba slot 消耗最低 |
| 无 spec，保留 mamba radix | `no_buffer + radix enabled` | 可以保留 prefix cache，但 overlap 会关闭 |
| 已开启 FlashInfer GDN decode | 避免 `no_buffer`，改 `extra_buffer` 或调整 backend | 新版有独立保护 |
| 已关闭 radix | 不使用 `extra_buffer` | 没有 snapshot 消费者，extra buffer 只会降低并发 |

