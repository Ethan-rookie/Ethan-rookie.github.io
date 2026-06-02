+++
title = "发现 Mamba 问题后的定位过程"
date = 2026-06-02
description = "一次 SGLang Mamba scheduler、radix cache、spec v2 与 overlap 组合问题的定位记录。"
tags = ["SGLang", "Mamba", "Radix Cache", "Speculative Decoding", "问题定位"]
draft = false
+++

这篇记录一次 Mamba 相关问题的发现与定位过程：现象最初表现为版本升级后，mamba scheduler strategy、radix cache、speculative decoding、overlap scheduler 之间的组合约束更严格；进一步排查后，核心落在 Mamba recurrent state 与普通 attention KV cache 的差异上。

文中的本机路径、线上服务名、Pod 名称等环境信息已经打码，保留的是定位链路和判断依据。

## 发现的问题

本次问题表面上是在比较 SGLang `0.5.9` 与 `0.5.10.post1` 的 [模型服务已打码] 行为：旧服务看起来能启动、能压测；新版在 `mamba-scheduler-strategy`、radix cache、speculative decoding、overlap scheduler 组合下更容易暴露 mamba 空间或启动配置问题。

真正容易误判的点是：

```text
启动参数没有写 --disable-radix-cache
不等于运行时 radix cache 一定保持开启。
```

我们检查了某线上 Pod：

```text
[Pod 名称已打码]
```

它的参数看起来像：

```text
--speculative-algorithm EAGLE
--speculative-num-steps 3
--speculative-num-draft-tokens 4
# 未显式设置 --mamba-scheduler-strategy
# 未显式设置 --disable-radix-cache
# 未观察到 SGLANG_ENABLE_SPEC_V2=1
```

因为 `mamba_scheduler_strategy=auto` 默认会变成 `no_buffer`，这个 Pod 从参数上很像：

```text
spec + no_buffer + radix enabled
```

但它实际没有问题的原因不是这个组合成立，而是旧代码在 `no_buffer + spec + radix` 下静默执行了：

```python
self.disable_radix_cache = True
```

所以它实际运行组合应理解为：

```text
spec + no_buffer + radix disabled
```

新版代码把这个隐式降级改成显式冲突，因此同样的参数在新版里会报错或要求用户明确选择：

```text
要么 no_buffer + --disable-radix-cache
要么 extra_buffer + radix + SGLANG_ENABLE_SPEC_V2=1
```

这篇文档重点不是泛泛讲参数，而是讲清楚 **Mamba state 为什么和普通 attention KV cache 不一样，为什么 radix cache 在 Mamba 上需要稳定 snapshot，为什么 no_buffer、extra_buffer、overlap、spec v2 会互相影响，以及代码里的并发/slot 计算到底在哪里发生。**

## 定位结论

| 问题 | 结论 |
|---|---|
| 旧版本 Pod 为什么 `spec + no_buffer + 未显式 disable radix` 也没问题 | 旧代码静默把 `disable_radix_cache` 改成 `True`，实际没有保持 radix |
| 新版为什么报错 | 新版禁止 `no_buffer + radix + speculative decoding` 这个不安全组合 |
| `SGLANG_ENABLE_SPEC_V2=1` 能不能解决 no_buffer/radix 冲突 | 不能；它主要打开 spec v2 overlap，不会自动改 mamba strategy，也不会自动关 radix |
| ping-pong buffer 是给谁用的 | 主要给 MambaRadixCache 保存稳定 mamba state snapshot 用 |
| 关闭 radix 后还有 ping-pong buffer 吗 | `no_buffer + disable radix` 下不会分配 ping-pong track buffer，但仍有主 MambaPool |
| extra_buffer 为什么降低并发 | 每个请求除 running mamba slot 外，还要额外占用 track slot；overlap 开时通常更多 |
| `mamba-full-memory-ratio` 调大能解决什么 | 能增加 mamba pool 可用 slot，但不能修正不兼容参数组合 |

## Mamba 的 cache 到底是什么

普通 Transformer attention 的 KV cache 可以按 token 保存：每个 token 产生一组 K/V block。prefix cache 复用时，系统只要知道某段 token prefix 对应哪些 KV block，就能把这些 block 接到后续请求上继续算。

Mamba/SSM 的核心不是每个 token 存一份 KV，而是 recurrent state。每一步会把当前 state 原地推进到下一步。对服务端来说，Mamba cache 更像是：

```text
request 当前运行到某个 token 位置时的模型内部状态
```

而不是：

```text
每个 token 都有独立可拼接的 KV block
```

在代码里，Mamba state 由 `MambaPool` 预分配。它包含至少两类主状态：

| 状态 | 含义 | 代码 |
|---|---|---|
| `conv_state` | convolution/state-space 前端相关状态 | `[本地代码路径已打码]/python/sglang/srt/mem_cache/memory_pool.py:254` |
| `temporal_state` | SSM recurrent state | `[本地代码路径已打码]/python/sglang/srt/mem_cache/memory_pool.py:269` |

初始化时直接 `torch.zeros`：

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

这意味着日志里看到的 mamba cache 显存不是“请求来了才一点点申请全部 tensor”，而是启动时按 `max_mamba_cache_size` 预分配一块大池子。后续请求只是从这个池子里分配 slot index。

### mamba slot

一个 mamba slot 可以理解成：

```text
MambaPool 中保存一份完整 recurrent state 的位置
```

请求运行时会持有：

```text
req.mamba_pool_idx
```

它指向当前请求的 running state。这个 slot 会随着 decode/prefill 继续原地变化。

因此，`req.mamba_pool_idx` 不是 token index，也不是 KV block index，而是一份可变 recurrent state 的位置。

### spec intermediate state

如果开启 speculative decoding，MambaPool 还会分配 speculative intermediate state：

```python
if speculative_num_draft_tokens is not None:
    intermediate_ssm_state_cache = torch.zeros(...)
    intermediate_conv_window_cache = [torch.zeros(...)]
```

代码位置：

```text
[本地代码路径已打码]/python/sglang/srt/mem_cache/memory_pool.py:274
```

这部分容易和 ping-pong buffer 混淆。它是 spec target verify 过程中的中间状态，不是 radix cache 保存 prefix snapshot 的 ping-pong/track buffer。

## 普通 RadixCache 和 MambaRadixCache 的区别

普通 attention 的 radix cache 可以理解为：

```text
radix tree 节点
  key: token prefix
  value: 这段 prefix 对应的 KV cache indices
```

这种结构很自然，因为普通 KV cache 是按 token/block 存的。一个 prefix 被拆成树上的多段后，后面的子树仍然可以接着复用对应 KV block。

MambaRadixCache 多了一层：

```text
radix tree 节点
  value: 普通 attention KV indices
  mamba_value: 这个 prefix 对应的 mamba state slot
```

代码里 `TreeNode` 同时有 `value` 和 `mamba_value`：

```python
self.value: Optional[torch.Tensor] = None
self.mamba_value: Optional[torch.Tensor] = None
```

代码位置：

```text
[本地代码路径已打码]/python/sglang/srt/mem_cache/mamba_radix_cache.py:75
[本地代码路径已打码]/python/sglang/srt/mem_cache/mamba_radix_cache.py:76
```

关键区别在于：**Mamba 的 state 不能像普通 KV block 一样随便按 token 拆分。**

代码里 `_split_node()` 直接写了：

```python
new_node.mamba_value = None  # mamba cache can not be split
```

位置：

```text
[本地代码路径已打码]/python/sglang/srt/mem_cache/mamba_radix_cache.py:1086
```

这说明 MambaRadixCache 并不是“树上每个 token 都有完整 mamba state”。它只能在某些稳定边界保存 checkpoint。普通 KV cache 可以拆 prefix，Mamba state 只能保存某个 prefix 末尾的状态点。

## MambaRadixCache 如何保持状态稳定

问题的核心是：Mamba running state 会原地变化，但 radix cache 需要保存可复用的稳定 prefix state。

如果 radix tree 直接保存一个正在运行的 slot，而请求继续 decode，这个 slot 里的 state 就会继续变化。后续另一个请求以为拿到的是 prefix A 的 state，实际可能已经变成 prefix A+B 的 state。

因此，MambaRadixCache 需要回答一个问题：

```text
radix 节点里的 mamba_value 到底指向谁？
```

### no_buffer 模式

`no_buffer` 下没有额外 snapshot buffer。radix 保存的是当前请求的主 mamba slot：

```python
mamba_value = req.mamba_pool_idx.unsqueeze(-1).clone()
```

代码位置：

```text
[本地代码路径已打码]/python/sglang/srt/mem_cache/mamba_radix_cache.py:576
```

这条路径的特点：

| 特点 | 说明 |
|---|---|
| slot 数量 | 每个 running request 主要占 1 个主 mamba slot |
| snapshot | 没有额外 snapshot |
| radix 保存内容 | 直接保存主 mamba slot |
| 风险 | 这个 slot 是 mutable 的 |
| 适用边界 | 无 spec、无 overlap 时可以靠调度约束降低风险 |

没有 spec/overlap 时，请求生命周期比较线性，可以尽量保证 radix 持有的 slot 不被错误推进或提前复用。一旦打开 spec 或 overlap，状态推进、验证、回滚、复用可能交错，`no_buffer + radix` 就很难保证稳定性。

### extra_buffer 模式

`extra_buffer` 的目的就是把：

```text
running slot
```

和：

```text
radix 要保存的 stable snapshot slot
```

拆开。

请求继续用主 mamba slot 向前跑；在需要保存 prefix cache 的边界，把主 slot 的状态 copy 到额外 track slot。radix tree 保存 track slot，而不是保存 running slot。

代码里保存 mamba_value 时会走：

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
[本地代码路径已打码]/python/sglang/srt/mem_cache/mamba_radix_cache.py:562
```

请求真正申请 track buffer 的地方：

```python
if self.enable_mamba_extra_buffer:
    req.mamba_ping_pong_track_buffer = self.mamba_pool.alloc(
        self.mamba_ping_pong_track_buffer_size
    )
```

位置：

```text
[本地代码路径已打码]/python/sglang/srt/mem_cache/memory_pool.py:619
```

### 为什么叫 ping-pong

overlap scheduler 打开时，可能出现一边 forward 继续推进 running state，一边 cache/scheduler 还需要读上一轮稳定 snapshot 的情况。为了避免同一个 track slot 同时被读和写，需要两个 track slot 轮换。

当前代码中：

```python
self.mamba_ping_pong_track_buffer_size = 2 if enable_overlap_schedule else 1
```

位置：

```text
[本地代码路径已打码]/python/sglang/srt/mem_cache/memory_pool.py:544
```

所以：

| overlap | track slot 数量 | 解释 |
|---|---:|---|
| off | 1 | 没有并行读写，单个稳定 snapshot slot 足够 |
| on | 2 | ping-pong 轮换，避免读写同一个 snapshot slot |

### 关闭 radix 后为什么不需要 ping-pong

ping-pong/track buffer 的消费者是 MambaRadixCache。关闭 radix 后，不再保存 prefix tree，也不再需要把 mamba state 放进 radix 节点。

因此：

```text
no_buffer + --disable-radix-cache
```

仍然会有主 `MambaPool`，因为模型运行必须有 recurrent state；但不会分配 `req.mamba_ping_pong_track_buffer`。

这也是为什么 `extra_buffer + --disable-radix-cache` 在新版中被认为没有意义，甚至会被拦截：没有 radix snapshot 消费者，extra buffer 只会浪费 mamba slot。

## prefix 命中时怎么恢复 mamba state

MambaRadixCache 命中 prefix 后，如果节点上有 `mamba_value`，会把 cache 中保存的 mamba state copy 到请求本地 running slot：

```python
src_index = last_node.mamba_value
dst_index = req.mamba_pool_idx.unsqueeze(0)
self.req_to_token_pool.mamba_pool.copy_from(src_index, dst_index)
```

位置：

```text
[本地代码路径已打码]/python/sglang/srt/mem_cache/mamba_radix_cache.py:1049
[本地代码路径已打码]/python/sglang/srt/mem_cache/mamba_radix_cache.py:1064
```

这进一步说明 `mamba_value` 保存的不是 token，也不是普通 KV block，而是一个能恢复 recurrent state 的 slot index。

## 定位过程：代码计算问题在哪里

本次容易混乱的“计算”有两层：

1. `max_mamba_cache_size` 怎么从显存或参数算出来。
2. `max_running_requests` 怎么根据 mamba slot 消耗再被压低。

### max_mamba_cache_size 的计算

Mamba 模型会在 `profile_max_num_token()` 里先计算普通 KV cache 可用 token 数；如果是 mambaish 模型，会先调用：

```python
rest_memory = self.handle_max_mamba_cache(rest_memory)
```

位置：

```text
[本地代码路径已打码]/python/sglang/srt/model_executor/model_runner_kv_cache_mixin.py:174
```

`handle_max_mamba_cache()` 做几件事：

| 情况 | 行为 | 代码 |
|---|---|---|
| 开 spec | 先为 speculative intermediate mamba state 预留显存 | `model_runner_kv_cache_mixin.py:184` |
| 显式设置 `--max-mamba-cache-size` | 直接使用用户设置，再按 DP 切分 | `model_runner_kv_cache_mixin.py:201` |
| `disable_radix_cache=True` 且显式设置 `max_running_requests` | `max_mamba_cache_size = max_running_requests / dp_size` | `model_runner_kv_cache_mixin.py:206` |
| 其他情况 | 按 `mamba_full_memory_ratio` 在 mamba state 和 full KV cache 之间分配显存 | `model_runner_kv_cache_mixin.py:218` |

比例计算的核心是：

```python
mamba_state_memory_raw = (
    total_rest_memory
    * server_args.mamba_full_memory_ratio
    / (1 + server_args.mamba_full_memory_ratio)
)

server_args.max_mamba_cache_size = int(
    (mamba_state_memory_raw * (1 << 30))
    // config.mamba2_cache_params.mamba_cache_per_req
)
```

位置：

```text
[本地代码路径已打码]/python/sglang/srt/model_executor/model_runner_kv_cache_mixin.py:222
[本地代码路径已打码]/python/sglang/srt/model_executor/model_runner_kv_cache_mixin.py:228
```

因此，`--mamba-full-memory-ratio` 调大，本质是让更多剩余显存划给 mamba state pool，可能增大 `max_mamba_cache_size`。但它只解决“slot 总数不够”的问题，不能解决不兼容配置。

### max_running_requests 的二次压缩

真正对并发影响很大的地方是 `_resolve_max_num_reqs()`：

```python
if self.mambaish_config is not None:
    ratio = self._calculate_mamba_ratio()
    max_num_reqs = min(
        max_num_reqs, self.server_args.max_mamba_cache_size // ratio
    )
```

位置：

```text
[本地代码路径已打码]/python/sglang/srt/model_executor/model_runner_kv_cache_mixin.py:853
```

`ratio` 的计算如下：

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
[本地代码路径已打码]/python/sglang/srt/model_executor/model_runner_kv_cache_mixin.py:373
```

这可以整理成：

| 配置 | `_calculate_mamba_ratio()` | 对并发的影响 |
|---|---:|---|
| radix disabled | 1 | `max_mamba_cache_size` 基本按 1 slot/request 理解 |
| radix enabled + no_buffer | 3 | prefix cache 场景按 3 slot/request 的保守模型估算 |
| radix enabled + extra_buffer + overlap off | 4 | 3 个基础 slot 模型 + 1 个 track slot |
| radix enabled + extra_buffer + overlap on | 5 | 3 个基础 slot 模型 + 2 个 ping-pong track slots |

所以 `max_running_requests=43` 这种数通常不是手写出来的，而是：

```text
max_running_requests = min(用户配置/估算值, max_mamba_cache_size // mamba_ratio)
```

如果某个配置下 `max_mamba_cache_size=216`，`extra_buffer + overlap on` 的 ratio 是 5，那么：

```text
216 // 5 = 43
```

这就是 extra_buffer 看起来“降低并发”的直接原因：不是模型计算变慢，而是每个请求在 mamba pool 中被认为需要更多 slot。

### runtime allocation 与估算不完全是一回事

实际请求进来时，`HybridReqToTokenPool.alloc()` 一定会分配主 mamba slot：

```python
mid = self.mamba_pool.alloc(1)
```

如果 `enable_mamba_extra_buffer=True`，才会继续申请 ping-pong/track slots：

```python
req.mamba_ping_pong_track_buffer = self.mamba_pool.alloc(
    self.mamba_ping_pong_track_buffer_size
)
```

位置：

```text
[本地代码路径已打码]/python/sglang/srt/mem_cache/memory_pool.py:612
[本地代码路径已打码]/python/sglang/srt/mem_cache/memory_pool.py:619
```

失败日志也能区分：

| 报错 | 更可能含义 |
|---|---|
| `Not enough space for mamba cache` | 主 mamba slot 不够 |
| `Not enough space for mamba ping pong idx` | extra_buffer 的 track slot 不够 |

另外，`alloc_req_slots()` 中还有一个 prefix cache 场景的保守估算：

```python
MAMBA_STATE_PER_REQ_PREFIX_CACHE = 3
MAMBA_STATE_PER_REQ_NO_CACHE = 1
```

位置：

```text
[本地代码路径已打码]/python/sglang/srt/mem_cache/common.py:20
```

它会根据 `tree_cache.supports_mamba()` 判断需要多少 mamba state：

```python
factor = (
    MAMBA_STATE_PER_REQ_PREFIX_CACHE
    if tree_cache.supports_mamba()
    else MAMBA_STATE_PER_REQ_NO_CACHE
)
```

位置：

```text
[本地代码路径已打码]/python/sglang/srt/mem_cache/common.py:304
```

这部分是调度/驱逐前的保守检查，不等同于每个请求最终一定物理申请 3 个新 slot。真正是否申请 ping-pong track buffer，仍然由 `enable_mamba_extra_buffer()` 决定。

### 这次定位中的计算误区

本次最容易错的不是某一个算式本身，而是把下面三件事混成了一件：

| 容易混淆的东西 | 实际含义 |
|---|---|
| `max_mamba_cache_size` | MambaPool 里最多有多少 state slot |
| `max_running_requests` | 调度层允许同时 running 的请求数 |
| `mamba_ratio` | 每个请求在某种 radix/extra/overlap 模式下需要预留多少 mamba slot 的估算 |

因此：

```text
max_mamba_cache_size 大
不等于
max_running_requests 一定大
```

因为只要启用 radix 和 extra_buffer，`max_running_requests` 会被 `max_mamba_cache_size // ratio` 压低。

## 定位过程：版本差异

### 旧版本 Pod 的行为

旧版本 Pod 中 `_handle_mamba_radix_cache()` 对 `no_buffer + spec + radix` 的处理是静默关闭 radix：

```python
else:
    logger.warning(
        f"Disabling radix cache since speculative decoding for {model_arch} is not supported with radix cache yet."
    )
    self.disable_radix_cache = True
```

Pod 内定位：

```text
/usr/local/lib/python3.12/dist-packages/sglang/srt/server_args.py:1766
/usr/local/lib/python3.12/dist-packages/sglang/srt/server_args.py:1769
```

这解释了为什么 `[Pod 名称已打码]` 看起来同时开 spec、no_buffer、保留 radix，却没有问题：它实际没有保留 radix。

### 新版代码行为

新版代码改成了显式冲突：

```python
elif not self.disable_radix_cache:  # no_buffer
    if self.speculative_algorithm is None:
        self.disable_overlap_schedule = True
    else:
        if not self.disable_radix_cache:
            raise ValueError(
                f"Speculative decoding for {model_arch} is not compatible with radix cache when using --mamba-scheduler-strategy no_buffer."
                "To use radix cache with speculative decoding, please use --mamba-scheduler-strategy extra_buffer and set SGLANG_ENABLE_SPEC_V2=1."
            )
```

位置：

```text
[本地代码路径已打码]/python/sglang/srt/server_args.py:2201
[本地代码路径已打码]/python/sglang/srt/server_args.py:2215
```

这不是功能退化，而是把旧版本的隐式降级改为显式选择。这样可以避免用户以为自己在测：

```text
spec + no_buffer + radix enabled
```

实际却在测：

```text
spec + no_buffer + radix disabled
```

### FlashInfer GDN decode 的额外限制

新版还增加了：

```python
if (
    self.linear_attn_decode_backend == "flashinfer"
    and self.mamba_scheduler_strategy == "no_buffer"
):
    raise ValueError(...)
```

位置：

```text
[本地代码路径已打码]/python/sglang/srt/server_args.py:2163
```

因此某些场景即使关闭 radix，`no_buffer` 仍然可能被 FlashInfer GDN decode 的限制拦住。这是另一个独立限制，不要和 radix/spec 冲突混成一个问题。

## 定位过程：SGLANG_ENABLE_SPEC_V2 到底影响什么

`SGLANG_ENABLE_SPEC_V2` 不等于“是否开启 speculative decoding”。spec 是否开启由启动参数决定，例如：

```text
--speculative-algorithm EAGLE
```

`SGLANG_ENABLE_SPEC_V2=1` 主要影响 EAGLE/EAGLE3/STANDALONE 的 spec v2 overlap 路径：

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
[本地代码路径已打码]/python/sglang/srt/server_args.py:3010
```

所以：

| 配置 | 真实含义 |
|---|---|
| 有 `--speculative-algorithm EAGLE`，无 `SGLANG_ENABLE_SPEC_V2=1` | spec 开启，但 spec v2 overlap 关闭 |
| 有 `--speculative-algorithm EAGLE`，且 `SGLANG_ENABLE_SPEC_V2=1` | spec 开启，spec v2 overlap 打开 |
| `SGLANG_ENABLE_SPEC_V2=1` + `no_buffer` + radix enabled | 仍然冲突 |
| `SGLANG_ENABLE_SPEC_V2=1` + `extra_buffer` + radix enabled | 新版建议的 spec + radix 路径 |

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

| mamba strategy | radix | spec | `SGLANG_ENABLE_SPEC_V2` | overlap | mamba slot 模型 | 新版行为 | 说明 |
|---|---|---|---|---|---|---|---|
| `no_buffer` | disabled | off | 无关 | 可开 | 约 1 个主 slot/request | 允许，但需避开其他 backend 限制 | 无 prefix 复用，slot 消耗最低 |
| `no_buffer` | disabled | on | `0` 或未设 | spec 逻辑关闭 overlap | 约 1 个主 slot/request，加 spec intermediate | 允许，但需避开 FlashInfer GDN decode 限制 | 旧版本 Pod 静默降级后接近此组合 |
| `no_buffer` | disabled | on | `1` | spec v2 overlap 打开 | 约 1 个主 slot/request，加 spec intermediate | 允许，但需避开 FlashInfer GDN decode 限制 | 没有 radix 保存 mutable mamba state |
| `no_buffer` | enabled | off | 无关 | 被关闭 | 估算 ratio=3 | 允许 | radix 直接持有主 mamba slot，靠关闭 overlap 降低风险 |
| `no_buffer` | enabled | on | `0` 或未设 | spec 逻辑关闭 overlap | 估算 ratio=3 | 报错 | 新版禁止 `no_buffer + radix + spec` |
| `no_buffer` | enabled | on | `1` | spec v2 overlap 打开 | 估算 ratio=3 | 报错 | spec v2 不能解决 mutable slot 问题 |
| `extra_buffer` | enabled | off | 无关 | 可开 | 主 slot + track slot | 允许 | radix 保存 stable snapshot |
| `extra_buffer` | enabled | on | `0` 或未设 | spec 逻辑关闭 overlap | ratio 通常 4 | 可启动，但不是 spec v2 overlap 目标路径 | spec 开，但 v2 overlap 不开 |
| `extra_buffer` | enabled | on | `1` | spec v2 overlap 打开 | ratio 通常 5 | 新版建议路径 | spec + radix + overlap 的目标组合 |
| `extra_buffer` | disabled | 任意 | 任意 | 任意 | 额外 track 没有消费者 | 报错或不建议 | 关闭 radix 后 extra_buffer 没有意义 |

## 最终建议配置

| 目标 | 推荐配置 | 原因 |
|---|---|---|
| 保留 radix，并使用 spec v2 overlap | `--mamba-scheduler-strategy extra_buffer` + `SGLANG_ENABLE_SPEC_V2=1` | radix 需要稳定 mamba snapshot，spec v2 overlap 需要 ping-pong track buffer |
| 追求最高 mamba 并发，接受无 prefix cache | `--mamba-scheduler-strategy no_buffer` + `--disable-radix-cache` | 每请求 mamba slot 消耗最低 |
| 无 spec，保留 mamba radix | `no_buffer + radix enabled` | 可以保留 prefix cache，但 overlap 会关闭 |
| 已开启 FlashInfer GDN decode | 避免 `no_buffer`，改 `extra_buffer` 或调整 backend | 新版有独立保护 |
| 已关闭 radix | 不使用 `extra_buffer` | 没有 snapshot 消费者，extra buffer 只会降低并发 |
