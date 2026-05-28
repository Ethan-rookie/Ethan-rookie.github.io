+++
title = "sglang推理流程"
date = 2026-05-28
description = "从请求进入 SGLang 到 Transformer、MoE/EP、KV cache 与 DeepGEMM 的推理流程梳理。"
tags = ["SGLang", "LLM", "推理", "MoE", "Transformer"]
draft = false
+++

## 背景

本次会话围绕 LLM 推理架构 做了一次体系化梳理：从请求进入推理框架开始，到模型内部的 Transformer Block、QKV Attention、MLP、Mamba 混合 block、KV cache，再到 MoE、EP/TP/PP 的并行执行方式，最后补充了 SGLang DeepGEMM 中 GEMM 缓存的含义。

目标不是记几个术语，而是建立一条从“用户请求”到“GPU kernel 执行”的连续理解链路。

## 总览

一个 decoder-only LLM 可以先粗略看成：

```text
文本请求
-> tokenizer
-> token ids
-> embedding
-> 多层 block
   -> token mixing: Attention / Mamba
   -> channel mixing: MLP / MoE
-> logits
-> sampler
-> next token
-> 循环 decode
```

推理框架负责调度、批处理、显存管理、KV cache、CUDA graph、通信和 kernel 调用。模型本身负责把 token 向量一层层变换成下一个 token 的概率分布。

## 已确认事实

### 请求进入框架后发生什么

请求进入 SGLang/vLLM 这类推理框架后，通常经历：

```text
HTTP / RPC request
-> tokenizer 编码
-> scheduler 排队与 continuous batching
-> prefill 计算 prompt
-> 写入 KV cache / Mamba state
-> decode 循环生成新 token
-> sampler 选择 token
-> detokenizer / stream 返回
```

模型本身不理解“请求”“HTTP”“流式返回”。它只接收 token ids / hidden states，并输出 logits。

### Block 是什么

block 是模型中重复堆叠的基本层。典型 Transformer block：

```text
x
-> norm
-> Attention token mixing
-> residual add
-> norm
-> MLP channel mixing
-> residual add
```

现代模型可能有 parallel residual、post-norm、MoE MLP、Mamba mixer 等变体，但仍可以按“一个 block 里先做 token mixing，再做 per-token feature transform”来理解。

注意两个 block 不要混淆：

```text
模型 block: 一层网络结构
KV cache block/page: 推理框架显存分页单位
```

### Token mixing 是什么

token mixing 是不同 token 位置之间交换信息。

Attention 做 token mixing 的方式是：

```text
Q: 当前 token 想找什么
K: 历史 token 有什么标签
V: 历史 token 提供什么内容
```

核心计算：

```text
score = Q @ K.T / sqrt(head_dim)
weight = softmax(mask(score))
output = weight @ V
```

Mamba 做 token mixing 的方式不是显式 QK 匹配，而是从左到右扫描序列，用 state 压缩历史：

```text
state_t = update(state_{t-1}, x_t)
y_t = read(state_t)
```

混合模型中，“某些 block 用 Attention 做 token mixing，某些 block 用 Mamba 做 token mixing”的意思是：不同层的 token mixer 类型不同。

### MLP 是什么

MLP/FFN 是 Transformer 原始结构中就有的子层。Attention 负责 token 间通信，MLP 负责每个 token 内部的 feature/channel 加工。

经典 FFN：

```text
hidden_dim -> intermediate_dim -> hidden_dim
```

现代 LLM 常见 SwiGLU：

```text
gate = x @ W_gate
up   = x @ W_up
mid  = silu(gate) * up
out  = mid @ W_down
```

MLP 通常逐 token 独立计算，不负责不同 token 之间互相看。

### Prefill 和 Decode

prefill 阶段一次处理 prompt tokens：

```text
[batch, prompt_len, hidden_dim]
```

每个 Attention layer 生成并写入 prompt 的 K/V。

decode 阶段每步通常只处理新 token：

```text
[batch, 1, hidden_dim]
```

新 token 计算自己的 Q/K/V，把新 K/V 追加到 KV cache，再用新 Q attend 历史 K/V。

### 混合模型中的 cache

Attention block 有 KV cache：

```text
KV cache ~= K + V, 随 seq_len 增长
```

Mamba block 没有 Attention KV cache，但有自己的 state cache，例如 conv state / ssm state：

```text
Mamba state 通常按 request/layer 保存固定大小状态
```

混合模型总缓存大致是：

```text
Attention 层 KV cache + Mamba 层 state cache
```

只有 Attention 层贡献传统 KV cache。

### MoE 和 Expert

普通 dense MLP：

```text
所有 token 都走同一个 MLP
```

MoE MLP：

```text
router + 多个 expert MLP
```

对每个 token：

```text
router_logits = x @ W_router
router_probs = softmax(router_logits)
selected_experts = topk(router_probs, k)
out = sum(router_weight_i * expert_i(x))
```

expert 不是人工指定“数学专家”“代码专家”，而是在训练中由 router 和 expert 参数共同学出来的分工。

### EP 不是稀疏路由本身

MoE 的稀疏性来自模型结构：

```text
每个 token 只选 top-k experts
```

EP 的作用来自系统执行：

```text
把 experts 分布到不同 GPU / rank
token 按 router 结果 dispatch 到对应 expert
expert 算完后 combine 回来
```

不开 EP 也不是所有 expert 都算。不开 EP 时仍然只算 top-k experts，只是 experts 不按 EP 维度分散，可能本地持有全量 experts，或按 TP 切在一个并行组里。

开 EP 的收益：

```text
减少单 rank 持有的 expert 参数
让不同 GPU 同时处理不同 expert
支撑更大 MoE 模型和更高吞吐
```

开 EP 的代价：

```text
dispatch all-to-all
combine all-to-all
负载不均
小 batch decode 下通信开销明显
```

因此 EP 不改变模型数学结果，不带来模型能力质变。它是用通信换 expert 参数分布和 expert 计算并行度。

### TP / PP / EP 对执行的影响

TP 切同一层内的矩阵、head 或 expert 矩阵：

```text
Attention heads / QKV / MLP 矩阵按 rank 分片
需要 all-reduce / reduce-scatter 等通信
KV cache 通常也按 head 或张量维度分片
```

PP 切不同 block/layer：

```text
stage 0: block 1-10
stage 1: block 11-20
stage 2: block 21-30
```

KV cache / Mamba state 放在拥有对应 layer 的 stage 上。decode 每个 token 都要穿过所有 pipeline stage。

EP 切 MoE experts：

```text
GPU/rank group 0: 部分 experts
GPU/rank group 1: 另一部分 experts
```

主要影响 MoE MLP，不影响普通 dense attention 的数学结构。

### GEMM 更大是什么意思

GEMM 是矩阵乘法：

```text
C = A @ B
```

expert MLP 中常见：

```text
A: [num_tokens_for_expert, hidden_dim]
B: [hidden_dim, intermediate_dim]
C: [num_tokens_for_expert, intermediate_dim]
```

`num_tokens_for_expert` 越大，GEMM 的 M 维越大，GPU 更容易吃满 Tensor Core，kernel 启动和通信成本也更容易被摊薄。

prefill token 多，expert 更容易攒到大 GEMM。decode 每步 token 少，MoE/EP 的小 GEMM 与 all-to-all 通信开销更敏感。

### SGLang 中 GEMM 缓存的含义

在 SGLang DeepGEMM 语境里，“GEMM 缓存”通常不是缓存矩阵乘法结果：

```text
不是缓存 C = A @ B
```

因为 activation A 每次请求都会变，输出 C 也会变。

它更接近缓存某个 GEMM shape 的执行方案：

```text
M, N, K
dtype
layout
num_groups
GPU arch
kernel type
```

DeepGEMM 第一次遇到某个 shape 时可能 JIT 编译 kernel，并把编译产物落到缓存目录。SGLang 的 `compile_deep_gemm.py` 通过 warmup 请求提前触发这些 DeepGEMM 调用，降低正式 serving 时的 JIT 抖动。

可以分三层：

```text
结果缓存: 缓存 C，LLM 推理中通常不可用
JIT 缓存: 缓存某个 GEMM shape 的 kernel/编译产物
硬件缓存: 单次 GEMM 执行时把 tile 放到 shared memory/register
```

## 当前推断

本次讨论偏向推理系统视角。后续学习时建议继续保持两条线并行：

```text
模型数学结构: block / attention / MLP / MoE / Mamba / MLA
系统执行结构: scheduler / cache / kernel / parallel / communication
```

很多概念名字相同但层级不同，例如 cache 可以指 KV cache、prefix cache、DeepGEMM JIT cache、GPU L2/shared memory cache。需要每次先问：“这个 cache 缓存的是数据、编译产物、路由状态，还是硬件 tile？”

## 学习地图

### 1. Transformer 基础结构

- Tokenizer、BPE/SentencePiece、token ids、special tokens
- Embedding、position id、token type、vocab projection / LM head
- RMSNorm / LayerNorm、pre-norm / post-norm、residual
- Q/K/V、multi-head attention、causal mask
- RoPE、ALiBi、YaRN、long RoPE scaling
- MHA、MQA、GQA，以及 KV head 和 Q head 的关系
- MLP/FFN、SwiGLU、GeGLU、activation、intermediate size
- Logits、temperature、top-k、top-p、min-p、repetition penalty、stop tokens

### 2. Attention 与 KV Cache

- Prefill vs decode 的计算差异
- KV cache shape、按 layer/head/token 组织方式
- PagedAttention、KV page/block、free list、eviction
- Prefix cache、radix cache、prompt cache、cache-aware routing
- Chunked prefill、extend attention、decode attention
- FP8 KV cache、KV cache quantization、dequant path
- FlashAttention、FlashInfer、Triton attention、CUTLASS attention
- MLA latent cache、MHA/MLA 的 cache layout 差异

### 3. MLA 需要重点补

- MLA: Multi-head Latent Attention 的动机
- q_lora_rank、kv_lora_rank、q_nope/q_pe、k_nope/k_pe
- RoPE 只作用于哪部分维度
- latent cache 为什么能降低 KV cache 体积
- absorb / non-absorb 计算路径
- DeepSeek V2/V3/R1 中 MLA 与普通 MHA 的区别
- MLA decode 时从 latent cache 恢复 K/V 或直接做 absorbed projection 的路径
- MLA 与 chunked prefix cache、FP8 KV cache、DeepGEMM 的结合

### 4. Mamba 与混合架构

- SSM、selective scan、state update
- conv state、ssm state、decode step
- Mamba block 与 Transformer block 的结构差异
- hybrid model 中 Attention/Mamba block 的分布策略
- Mamba state cache 与 KV cache 的区别
- 长上下文下 Attention 与 Mamba 的复杂度和表达力权衡

### 5. MoE 模型结构

- Router/gate、top-k routing、softmax/sigmoid routing
- Routed experts、shared experts
- Expert MLP 的 gate/up/down 权重
- Expert capacity、token dropping、padding、alignment
- Load balancing loss、aux loss、z-loss、router noise
- Expert collapse、热 expert、长尾 expert
- Grouped GEMM、masked grouped GEMM、contiguous grouped GEMM
- MoE prefill 与 decode 的性能差异

### 6. MoE 系统执行与 EP

- EP、DeepEP、NIXL-EP、all-to-all dispatch/combine
- normal dispatch vs low-latency dispatch
- EPLB: expert parallel load balancing
- Expert placement、expert replication、expert migration
- token dispatch buffer、combine buffer、rank-local expert
- EP + TP + PP + DP 的组合方式
- 小 batch decode 下 EP 为什么可能不划算
- 大 batch/prefill 下 expert GEMM 为什么更容易跑满

### 7. 并行策略

- TP: tensor parallel，切矩阵/head
- PP: pipeline parallel，切 layer/block
- EP: expert parallel，切 expert
- DP: data parallel，复制模型处理不同 batch
- CP: context parallel，切长上下文
- SP: sequence parallel，切 sequence 维的激活/归一化
- all-reduce、reduce-scatter、all-gather、all-to-all
- NCCL、NVLink、IB/RDMA、拓扑对通信的影响
- pipeline bubble、microbatch、overlap communication/compute

### 8. 推理框架

- Scheduler、continuous batching、prefill/decode 分离调度
- Request lifecycle、tokenizer manager、detokenizer、streaming
- Memory pool、KV pool、CUDA graph、graph capture
- Speculative decoding、draft model、EAGLE、next-n
- PD disaggregation: prefill/decode 分离部署
- Prefix-aware routing、cache-aware routing
- Grammar constrained decoding、structured output
- Watchdog、warmup、latency jitter、GC freeze

### 9. Kernel 与硬件

- GEMM、BMM、grouped GEMM、batched GEMM
- Tensor Core、warp、CTA/block、SM、occupancy
- global memory、L2、shared memory、register
- tile、TMA、WGMMA、persistent kernel
- Triton、CUTLASS、DeepGEMM、FlashInfer
- JIT 编译、kernel cache、autotune cache
- CUDA graph 与 kernel launch overhead
- overlap: attention/MLP/dispatch 的计算通信重叠

### 10. 量化与精度

- BF16、FP16、FP8、INT8、INT4、FP4/NVFP4/MXFP4
- weight-only quantization、activation quantization
- per-tensor、per-channel、per-token、per-group scale
- blockwise quantization、UE8M0 scale
- AWQ、GPTQ、Marlin、CUTLASS W4A8
- KV cache quantization 与 attention backend 的兼容性
- 量化对 GEMM kernel、显存、吞吐和精度的影响

### 11. 训练与对齐补充

- Pretraining objective、causal LM loss
- SFT、DPO、RLHF/RLAIF
- LoRA、QLoRA、adapter
- MoE 训练中的 load balancing
- Gradient checkpointing、ZeRO/FSDP、activation recompute
- 训练并行和推理并行的差异

### 12. SGLang 代码阅读路线

- `python/sglang/srt/server_args.py`: server 参数与 backend 选择
- `python/sglang/srt/managers/scheduler.py`: 调度入口
- `python/sglang/srt/model_executor/model_runner.py`: 模型执行入口
- `python/sglang/srt/model_executor/forward_batch_info.py`: forward batch metadata
- `python/sglang/srt/models/deepseek_v2.py`: DeepSeek block、MLA、MoE
- `python/sglang/srt/models/deepseek_common/attention_forward_methods/`: MLA/MHA forward 路径
- `python/sglang/srt/layers/moe/`: MoE runner、EP layer、dispatcher
- `python/sglang/srt/layers/deep_gemm_wrapper/`: DeepGEMM wrapper 与 precompile
- `python/sglang/compile_deep_gemm.py`: DeepGEMM 预编译入口
- `sgl-kernel/csrc/`: C++/CUDA kernel 实现

## 决策

- 将后续学习按“模型结构”和“系统执行”两条线组织。
- 对 cache、block、parallel 这类多义词，先明确所在层级，再讨论机制。
- 对 MoE/EP 的理解以“固定 MoE 模型开不开 EP”为主，避免混入“MoE 相对 dense 模型的容量收益”造成概念混淆。

## 后续任务

- [ ] 单独学习 MLA：从 DeepSeek V2/V3 的 attention forward 路径开始。
- [ ] 画一张 MoE + EP 的 token dispatch/combine 数据流图。
- [ ] 对照 SGLang 代码跑一遍 DeepGEMM precompile 的调用链。
- [ ] 梳理 KV cache、prefix cache、radix cache、DeepGEMM JIT cache 的区别。
- [ ] 补一篇 TP/PP/EP/DP/CP/SP 的并行维度速查表。

## 相关链接

- 项目：LLM Serving 学习
- 主题：LLM 推理架构
- 主题：Transformer Block
- 主题：MoE 与专家并行
- 主题：SGLang DeepGEMM


