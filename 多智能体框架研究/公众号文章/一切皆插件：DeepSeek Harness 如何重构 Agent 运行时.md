# 一切皆插件：DeepSeek Harness 如何重构 Agent 运行时

DeepSeek Harness深度解读

> 它想回答一个更实际的问题：当你的 Agent 从“调用一次模型”长成“能读文件、跑命令、调用浏览器、记住历史、等待审批、拆分子任务”的系统之后，怎么避免把所有能力都塞进同一个 `while` 循环？

---

## 开篇：Agent 项目最容易长成一团什么

很多工程师第一次做 Agent，起点都很合理。

先把用户的问题发给大模型；如果模型要求调用工具，就执行工具；再把结果交回模型，直到它给出最终答案。几十行代码，一个可用的 Agent 就跑起来了。

```
messages = [user_message]while True:    reply = llm.chat(messages, tools=tools)    if not reply.tool_calls:        return reply.text    messages.append(reply)    for call in reply.tool_calls:        result = run_tool(call)        messages.append(result)
```

真正麻烦的事情，通常从第二周才开始出现。

删除文件前要不要让用户确认？Shell 命令该在本机跑，还是在远程沙盒跑？工具执行超时了，应该重试还是停止？用户刷新网页以后，刚才的对话怎么恢复？一个复杂任务要不要交给子 Agent？工具返回了两万字，下一轮还要原样塞进上下文吗？

如果这些判断都继续堆进上面的循环，`run_tool()` 会慢慢变成权限中心，`messages` 会慢慢变成数据库，模型调用处会慢慢变成重试器、监控器和工作流引擎。

最后，它看起来仍是一段 Agent 代码，实际上已经是一套没有边界的运行时。

DeepSeek Harness 选择了另一条路：**让 Agent Loop 只负责驱动，让其他能力以插件的方式接进来。**

这里的“一切皆插件”，不是说每个函数都要拆成一个 npm 包。

它真正想表达的是：**会独立变化的能力，应该拥有独立的接口、生命周期和扩展位置。**

![单体 Agent 循环与插件化 Agent 运行时对比](https://mmbiz.qpic.cn/mmbiz_png/E1NPKU9301zpIKUsfLg5Efv30rqUQ379NzoygIickJWfoa2xmmIUvlI7fzl4Bdn86s8vuJhc5gJ3vKicNn7LbYLiaMj0eico0YgIA2CBYDNvUo4/640?wx_fmt=png&from=appmsg)

接下来，我们就沿着一次真实任务的路径，理解这套架构为什么要这样设计。

---

## PART 01：先把地图摊开，一次 Agent 任务究竟经过了什么

### 01 Agent SDK 和 Agent Harness，差别不在“能不能调模型”

很多人把 Agent 框架理解成“帮我把 function calling 封装一下”。这没有错，但只描述了最外层。

一个模型 SDK 主要解决的是：怎样把消息发给模型，怎样读取流式输出，怎样声明工具 schema。

而一个 Agent Harness，也就是 Agent 运行时底座，还要解决下面几类问题：

- **模型路由**
    
    ：这次任务用哪个模型，模型配置变更后怎样生效；
    
- **上下文组装**
    
    ：系统提示词、历史消息、工具定义、记忆内容该怎样拼；
    
- **工具执行**
    
    ：模型调用工具后，如何校验参数、并行调度、处理异常；
    
- **状态持久化**
    
    ：进程重启、浏览器刷新或任务恢复后，如何找回同一个工作现场；
    
- **安全治理**
    
    ：文件写入、命令执行、网络访问，哪些自动放行，哪些必须审批；
    
- **交互与协作**
    
    ：Web、命令行、自动化协议、子 Agent 如何共用同一套任务状态。
    

可以把 SDK 理解成一台性能很好的发动机。

Harness 则是把发动机、仪表盘、刹车、座椅、安全带和道路规则装配成一辆能长期上路的车。这个类比只帮助建立直觉，技术上它们分别对应模型适配、会话、工具、策略、界面和生命周期管理。

DeepSeek Harness 的核心想法是：不要把这些职责偷偷塞进“调用模型”的函数里，而要让它们在运行时有明确位置。

### 02 一张总图：从配置到模型，再回到状态

先看全局。下面这五层并不是一次任务严格串行经过的五个函数，而是同一套系统的不同视角；它们都由插件装配，外层的插件运行时也不会把 Agent Loop 变成不可替换的特权核心。

1. **组合层**
    
    决定“这次启动装哪些能力”。它由 Profile、Bundle 和配置覆盖组成。
    
2. **插件运行时层**
    
    负责加载插件、提供服务、派发事件和在卸载时清理注册项。
    
3. **核心驱动层**
    
    包含 Agent、Agent Loop、提示词组装、工具注册表、模型服务和会话。
    
4. **能力层**
    
    提供可替换实现，例如 DeepSeek 模型、文件系统、Shell、沙盒、审批、搜索、子 Agent、工作流。
    
5. **状态与交互层**
    
    把过程写入 Session Event Log，再投影到持久化、Web UI、CLI、自动化客户端和遥测。
    

![DeepSeek Harness 总体技术架构图](https://mmbiz.qpic.cn/sz_mmbiz_png/E1NPKU9301xjgAcgWpftiaPHBa6hxhZdrJPFaBujS2FBf5ChX4kClZ6FITHia8VPseXjZtaicDHb4rmXQB71KKW8tWeeLzGGwsE7X4bnOBACzk/640?wx_fmt=png&from=appmsg)

如果用户在 Web 页面输入“帮我检查这个项目的测试失败原因”，路径大致是这样的：

```
用户输入  -> Agent 收到待处理消息  -> Agent Loop 组装系统提示词、可见工具和历史  -> LLM 生成回答或 tool call  -> 工具管线检查权限并执行  -> 工具结果写入会话  -> Agent Loop 决定是否继续下一步  -> 会话事件投影到页面、持久化和其他观察者
```

这里最重要的一点是：**模型请求和工具执行不是整套系统唯一的主角。**

配置决定能力集合，事件决定谁能观察过程，日志决定系统重启后还能记住什么。把这三件事看见以后，你就能理解为什么一个成熟的 Agent 系统不能只靠一条聊天数组支撑。

### 03 插件运行时的五个基础概念

DeepSeek Harness 建在 Cordis 之上。第一次接触时，`Service`、`Context`、`Inject`、`Event`、`Effect` 这些名字很容易让人觉得抽象。我们逐个翻译成工程里的问题。

**Service：我向系统提供什么能力？**

例如“模型调用”“工具注册”“会话管理”都可以是服务。服务先声明一个稳定入口，比如 `ctx.llm` 或 `ctx.tools`，其他代码只依赖这个入口，不直接绑定某一家实现。

**Context：运行时从哪里拿能力？**

Context 可以理解为当前 Agent 所在的“能力工作台”。一个插件要用模型服务，就从 `ctx.llm` 获取；要注册工具，就使用 `ctx.tools`。它不是全局变量的随意堆放处，而是有生命周期和作用域的能力容器。

**Inject：插件启动前依赖什么？**

假设一个插件想注册 DeepSeek 模型适配器，它首先需要 LLM 服务存在。`inject` 就是把这个前置条件说清楚。运行时根据服务是否就绪来激活插件，而不是让开发者手写一长串“先启动 A，再启动 B”。

**Event：发生一件事时，谁可以参与？**

模型请求前、工具执行前、工具执行后、一个 turn 即将结束时，系统都会提供具名事件。某些事件只是通知，某些事件允许插件包一层逻辑，甚至阻断后续执行。

其中一类重要事件叫 **Waterfall**，可以把它理解成环绕式中间件：监听器调用 `next()`，处理权才会交给后续插件；监听器直接返回，则表示它接管当前决定并截断后续链路。它适合审批、改写请求和结果治理这类需要“继续还是终止”判断的场景。

**Effect：注册的东西怎样被收回？**

插件装入时可能注册工具、提示词段、模型 Provider、定时器和事件监听器。它卸载时，这些贡献也必须一起撤销，否则热更新或切换配置后会出现重复工具、幽灵监听器和旧配置继续生效的问题。

下面是一个简化后的模型 Provider 注册示意。它不是完整生产代码，只保留架构关系：插件依赖抽象 LLM 服务，再把具体 Adapter 注册进去。

```
export const inject = ['llm']export function apply(ctx: Context) {  const adapter = new DeepSeekAdapter()  ctx.llm.registerAdapter(['deepseek-official'], adapter)}
```

Agent Loop 之后只面对统一的模型调用接口。今天是 DeepSeek，明天换成另一个 Provider，主循环不需要学会新的 HTTP 请求格式。

![插件运行时的核心概念与 LLM Provider 注册](https://mmbiz.qpic.cn/mmbiz_png/E1NPKU9301zgeN2iavFCJb88SfiaO6V4eDKgrJzWGrJr2jaeYrZJ0lhXC6AsVUTEib3hly7rAof4XljpJkJzY1icr7dOAwbLJd4q7b7ZOd63pxc/640?wx_fmt=png&from=appmsg)

**这一部分只记住三件事：**

- Agent Harness 解决的是模型调用之外的长期运行问题。
    
- 一切皆插件的前提，是先把稳定服务入口和事件入口定义好。
    
- 插件化的价值不是“拆得更碎”，而是让变化不必侵入 Agent Loop。
    

---

## PART 02：系统怎样被组装，又怎样跑完一次任务

### 04 Profile 与 Bundle：同一套底座，为什么能跑成 Web 和命令行

一个很自然的问题是：Web 版 Agent、命令行 Agent 和无人值守的自动化 Agent，难道要各自维护一套核心代码吗？

DeepSeek Harness 的答案是不用。它把“应用长什么样”从代码分支中抽出来，变成可组合的配置层。

**Profile** 可以理解为一个运行配置方案。例如 `web` Profile 需要浏览器界面和 HTTP 服务，`headless` Profile 则只需要接收一条命令、运行任务并输出结果。

**Bundle** 则是一组可以叠加的能力配置。基础 Bundle 负责模型、会话、工具、安全策略等共用能力；不同产品形态在它上面再添加自己的部分。

配置覆盖大致按下面的顺序发生：

```
基础 Bundle  -> 产品形态 Bundle  -> Profile 自己的配置覆盖  -> 用户级配置覆盖  -> 命令行临时覆盖
```

这里的“覆盖”很重要。它让用户不需要改动框架源码，也能替换模型参数、挂入新的插件或关闭某项能力。

一个极简配置示意可能长这样：

```
- id: llm  name: '@deepseek-ai/dsh-llm'- id: session  name: '@deepseek-ai/dsh-session'- id: tools  name: '@deepseek-ai/dsh-tools'- id: agent-loop  name: '@deepseek-ai/dsh-agent-loop'
```

这不是说配置文件比代码更神奇。

它表达的是一个很朴素的工程事实：**“系统装了什么”本来就是部署决策，应该能被看见、被检查、被覆盖。**

同时，这条路也有约束。DeepSeek Harness 的 patch 覆盖会替换目标配置行，而不是做隐式深度合并。好处是结果明确，坏处是覆盖者必须知道并重述自己想保留的字段。

这比“配置缺字段时悄悄补一个默认值”更麻烦，却能避免不同配置层悄悄拼出一个谁也说不清的最终状态。

![Profile 与 Bundle 的组合方式](https://mmbiz.qpic.cn/sz_mmbiz_png/E1NPKU9301yr4JMRO0OpouSFVlcCibuRHypJbq9qtXSqDeKRlDRicnEZ6BJ5SjtCtzsFgIH8Oq7r8Mbsqt5GfnkOM8OfuJXMrFFLj2N4mz5Hg/640?wx_fmt=png&from=appmsg)

### 05 Agent Loop：把循环压缩到最小，但不把能力做薄

很多入门教程会用一个 `while True` 写完 Agent。这个写法并不幼稚，它抓住了 Agent 的基本节奏：模型回答，工具执行，再让模型继续。

DeepSeek Harness 没有否定这个节奏，而是把它拆成三个便于观察的时间单位。

- **Turn**
    
    ：驱动器处理一批待办输入的一次完整工作回合，可以包含零个或多个 Step。
    
- **Step**
    
    ：Turn 内的一次模型请求，以及这次请求触发的工具调用。
    
- **Tool Call**
    
    ：模型要求执行的一个具体工具动作。
    

举个例子。用户说：“读取报错日志，定位失败测试，然后修复问题。”

模型第一次请求工具读取日志，这是 Step 1；模型看到日志后又调用搜索和读文件工具，这是 Step 2；模型修改代码并运行测试，可能是 Step 3。所有这些 Step 共同组成一个 Turn。

简化后的主流程可以写成：

```
while (agent.hasPendingInput()) {  const turn = agent.openTurn()  while (turn.needsAnotherStep()) {    const input = agent.claimInput()    const prompt = assembleSystemPromptAndTools(agent)    const history = session.deriveMessages()    const reply = await llm.stream({ prompt, history })    session.record(reply)    if (reply.hasToolCalls()) {      await tools.execute(reply.toolCalls)    }  }  agent.closeTurn()}
```

真实实现当然还要处理取消、并发工具、异常、恢复和流式分片。但从架构上看，Agent Loop 只需要守住这一小段骨架。

为了建立直觉，可以先看两个最直观的开放位置；真实实现还在 `agent/pre-step`、`agent/request`、`agent/request-error`、`llm/stream` 和 `agent/turn-stopping` 等事件上继续开放：

1. **进入模型前**
    
    ：插件可以补充或拒绝本次输入，例如注入任务上下文、应用计划模式、触发压缩。
    
2. **执行工具时**
    
    ：插件可以进行审批、沙盒限制、超时控制、结果加工和观测。
    

这就是“核心循环保持小”的真实含义。不是减少功能，而是让功能从循环外部通过明确的入口参与进来。

![一次 Agent Turn 的运行时序](https://mmbiz.qpic.cn/mmbiz_png/E1NPKU9301wdWlVzW37Ew0zwZKsYqjW5xNx9D75icBMsfedorbDoRSjicjSUPwhjCSCyNZageEceibliaxRYFoicmibfW07sibkxoW4ExItj7j8RBA/640?wx_fmt=png&from=appmsg)

### 06 Prompt 和 Tool 不是两张写死的数组

刚开始写 Agent 时，System Prompt 往往是一大段字符串，工具往往是一个全局数组。

这种写法在 Demo 阶段没有问题。但当不同用户、不同工作区、不同模式需要不同能力时，问题就出现了。

例如，一个只读分析任务不应该看到“删除文件”工具；一个计划阶段可能需要禁止真正执行命令；一个子 Agent 也许只需要搜索和读取能力，不应该继承父 Agent 的全部工具。

所以，DeepSeek Harness 把 Prompt 看成多个具名 section 的组合，把工具看成当前 Agent 作用域内可见定义的集合。

你可以把它理解成一张任务前的“工作台清单”：这次任务有哪些规则、能调用哪些工具、能访问哪些上下文，都在发给模型前统一装配。

这还带来一个经常被忽略的性能点：模型请求的前缀越稳定，KV Cache 越容易复用。

KV Cache 是大模型推理中保存历史 Key 和 Value 的缓存。对 Agent 而言，如果每一步都随意重排提示词和工具 schema，虽然语义差不多，但 token 序列变了，缓存命中就会变差。

因此，“插件可以动态装卸”不等于“每次请求都随机变化”。好的架构会把稳定性也作为组合规则的一部分。

**这一部分只记住三件事：**

- Profile 和 Bundle 把部署形态从业务代码中分离出来。
    
- Agent Loop 负责推动任务前进，不负责亲自实现每一种能力。
    
- Prompt 和 Tools 是本次任务的运行时装配结果，不是永远不变的全局常量。
    

---

## PART 03：为什么状态、安全和 Provider 替换，才是 Agent 工程的分水岭

### 07 Event Log：为什么聊天记录不够用

不少 Agent 项目把状态存在一个 `messages: Message[]` 数组里。只要页面不刷新、进程不重启，这很方便。

但一旦需要恢复、分叉、回放或审计，普通聊天数组就开始不够了。

假设模型正在流式输出，网页需要一边显示 token，一边在最终完成后保存消息；工具执行前发生了用户审批；一个子 Agent 从父任务的某个历史位置开始工作；工具结果太大，被截成预览、保存到 spill 文件，或在 compaction 阶段做首尾剪枝。只保存最后的聊天文本，很难解释这些事情是怎么发生的。

DeepSeek Harness 使用 **Session Event Log**，中文可以叫“会话事件日志”。它不是普通调试日志，而是一串按顺序追加的事实。

```
turn/startstep/startuser/messagerequest/header（首次、恢复或配置变化时）request/context（发生变化时）assistant/chunk ...assistant/messagetool/calltool/resultstep/endturn/end
```

这里的关键不是事件名称，而是它带来的推导能力。

- 模型历史可以从事件中投影出来；
    
- 页面可以从同一份事件中恢复流式输出和工具卡片；
    
- 持久化层可以把事件写入 JSONL 或 SQLite；
    
- 会话 fork 可以复制某个历史边界之前的事件；
    
- 遥测可以观察延迟、错误和工具活动，而不需要再往主循环里插一套埋点逻辑。
    

这种思想在软件架构里叫 **Event Sourcing，事件溯源**：不只保存“现在的状态”，还保存“状态是如何一步步变成现在这样的”。

它并不适合所有业务表。比如用户昵称的最终值，通常没必要为每次修改都建立复杂事件体系。但 Agent 的上下文、工具调用和流式输出天然是过程型数据，事件顺序本身就有价值。

DeepSeek Harness 还有一条很硬的纪律：**任何能进入模型请求的内容，都必须能从会话日志重建。**

这条纪律听起来严苛，实际是在避免一个很危险的问题：模型已经参考过一条内存里的“隐形上下文”，但进程恢复后这条上下文消失了。此时用户看到的历史、模型接下来的判断和系统的审计记录会开始彼此矛盾。

![会话事件日志如何投影为多种视图](https://mmbiz.qpic.cn/mmbiz_png/E1NPKU9301wBh8PejrQGpXicfsLUsosDGHUSUWfV2AxdBYIXHcM4BolXdz8ibTIZibolMz8bfnLiaLGMN2lS4f0AI0duMVQvkW6E5GsoNwpPr8k/640?wx_fmt=png&from=appmsg)

### 08 工具执行管线：不是所有工具调用都该直接执行

想象模型发出两个请求。

第一个是 `read_file`，读取项目里的一个日志文件；第二个是 `delete_file`，删除一批文件。

如果工具定义只提供一个 `execute()` 函数，这两个动作看上去一样：参数到了，函数执行。

但从风险角度，它们完全不同。读取文件可能只需要路径规则检查；删除文件可能需要确认当前工作区、申请人工审批、记录审计事件，并确保超时或取消时不会留下半完成状态。

DeepSeek Harness 把这种治理放进统一的工具执行管线：

```
模型给出 tool call  -> 校验参数、解析工具  -> pre-execute：允许、要求审批，或拒绝  -> guards：执行不可绕过的策略检查  -> execute：运行真正的工具正文  -> post-execute：检查、替换或阻断结果  -> result：通知会话、UI 和其他观察者
```

`pre-execute` 和 `post-execute` 是两个很重要的扩展位置。

前者解决“现在能不能执行”。审批、权限策略、计划模式都可以在这里发言。

后者解决“这个结果能不能原样交回模型”。例如安全策略可以把不合规结果转成错误反馈；溢出存储策略可以把超长纯文本替换为首尾预览、存储定位信息和检索提示；更高层的 compaction 才可能进一步生成摘要。UI 则从最终规范化结果得到展示数据。

你可能会问：为什么不把这些规则写在每个工具里？

因为规则往往跨越多个工具。文件写入、Shell、终端、浏览器操作都可能需要审批。把审批写进每个工具，不只重复，而且很容易漏掉新工具。统一管线让策略一次注册，多个工具共享。

这里还有一个边界需要说清：统一管线不等于安全自动完成。真正的安全仍然依赖沙盒实现、文件策略、批准通道和部署配置。架构负责把这些责任放在可插拔、可审计的位置，而不是替代它们。

![统一的工具执行治理管线](https://mmbiz.qpic.cn/mmbiz_png/E1NPKU9301xNoRSQO8PFiaZvialyJEUaW2pFvkgQsAic79CNtVnDam8mhVJLCpdehVYMKgOQt5UQGBzwkCxvXBanRORUicTLt3x1fCL8s0frK8o/640?wx_fmt=png&from=appmsg)

### 09 Capability Seam：如何把“可替换”做完整

“可以换模型”听起来像配置一个 API Base URL 就够了。

但真的想替换一项能力时，至少要回答三个问题：谁定义接口？谁提供实现？谁使用接口？

DeepSeek Harness 把这三种角色称为 **Capability Seam**，可以理解为“可替换能力的标准接头”。

- **Service Definition**
    
    ：声明能力接口。比如文件系统需要 `read`、`write`、`stat` 等什么操作。
    
- **Service Provider**
    
    ：提供具体实现。它可以访问本机文件，也可以转发到 E2B 或受沙盒限制的环境。
    
- **Consumer**
    
    ：真正使用这个接口的部分。对于文件系统，常见 Consumer 是面向模型的文件工具。
    

拿文件读取举例，Agent Loop 并不需要知道文件在本机、容器还是远程沙盒。它只关心“当前 Agent 可见的文件工具能否完成读取”。文件系统 Provider 换掉后，上面的工具和任务流程不用随之改写。

模型能力也是同样的结构：LLM 服务定义模型请求和流式响应的共同语言；DeepSeek、其他厂商或回放实现作为 Provider；Agent Loop 作为 Consumer 调用统一接口。

更有意思的是执行环境。Shell、子进程、终端、LSP 往往需要共享同一个“进程到底在哪里运行”的世界。如果每个工具各自实现一套远程逻辑，替换成本会非常高。

把底层 Provider 指向另一种执行环境后，上层的 Shell、PTY 终端、LSP 等能力就可以一起迁移。这才是接口分层真正节省复杂度的地方。

![可替换能力的接口、提供方与使用方](https://mmbiz.qpic.cn/sz_mmbiz_png/E1NPKU9301xvwVVVnJFiaZ2hbPBoWT60dIPTicSPLUlpWWVh1NqZKGD3R4VjiaiaEZwwfUDuElYHpyfszoAfXxVSEB60ORSda3VVcxBjKPCaxn4/640?wx_fmt=png&from=appmsg)

**这一部分只记住三件事：**

- Event Log 保存的不只是聊天内容，而是任务过程的可重建事实。
    
- 工具管线让跨工具的安全、审批和结果治理有一个统一入口。
    
- 真正的可替换能力必须同时拥有接口、实现和使用方，只有 Provider 不叫完整架构。
    

---

## PART 04：插件化解决了什么，又把复杂度放到了哪里

### 10 这套架构真正得到的五个收益

第一，**模型和执行环境可以独立替换**。

当模型 Provider、文件系统 Provider、Shell Provider 都依赖统一服务接口时，替换不再意味着修改主循环。你需要验证的是新 Provider 是否满足接口和安全要求，而不是把整个 Agent 重写一遍。

第二，**不同产品形态可以复用同一个运行时**。

Web、命令行和自动化协议的交互方式不同，但它们可以围绕同一个 Session、Agent 和工具体系工作。差异留在组合层，而不是复制业务流程。

第三，**策略有了集中治理的位置**。

审批、超时、沙盒、持久化检查点、重试策略不必混入每一个工具和每一次模型调用。它们可以围绕事件和管线注册，并在需要时被替换或关闭。

第四，**状态具备回放和恢复基础**。

只要模型可见内容和关键过程都进入事件日志，页面、持久化、fork、转录和遥测就不必各自维护一份近似但不同的状态。

第五，**扩展行为可以拥有明确的卸载边界**。

这对热更新、动态配置和长期运行的服务尤其重要。一个插件被移除时，它注册的工具、监听器和提示词贡献也应该跟着消失。

### 11 它没有消灭复杂度，只是要求你诚实面对复杂度

插件化经常被误解成“拆开以后就简单了”。事实上，复杂度没有消失，它从一个大函数里移动到了接口、事件、配置和生命周期里。

这套架构至少有五类成本。

**第一类是概念成本。** 开发者要理解上下文、注入、作用域、事件模式和 disposer。尤其是 waterfall 事件，监听器如果没有正确调用 `next()`，就可能意外截断后续链路。

**第二类是配置成本。** Profile 和 Patch 很灵活，但也要求你能回答“最终启动的插件树是什么”。配置覆盖越多，越需要可视化、校验和明确优先级。

**第三类是边界成本。** 什么时候该新增一个 Provider，什么时候只是一个普通函数？不是所有代码都值得插件化。没有独立变化需求、没有独立生命周期、没有多个 Consumer 的逻辑，过早拆分只会增加阅读负担。

**第四类是状态纪律。** 事件日志带来回放能力，也要求开发者不能偷偷把重要上下文留在某个内存变量里。这个约束很值得，但实现时需要持续坚持。

**第五类是性能成本。** 提示词和工具 schema 的动态组装要考虑稳定顺序、缓存和 token 开销；插件注册与观察也不能无限叠加。动态能力越强，越需要关注请求前缀和运行时边界。

因此，DeepSeek Harness 值得学习的不是“多建目录、多拆模块”。

它更像一份提醒：当系统复杂起来，别再假装所有行为都属于 Agent Loop。

### 12 给刚入门 Agent 架构的工程师：从哪里开始借鉴

你不需要一开始就做一套完整 Harness。

如果你的项目只有一个模型、两个只读工具、没有恢复需求，那么一个清晰的循环加几段函数就足够。为它提前引入复杂插件系统，反而会拖慢交付。

但当下面任意信号开始出现时，就应该考虑建立明确扩展点：

- 同一个任务要支持多个模型或多个部署环境；
    
- 工具开始区分只读、写入、高风险操作；
    
- 用户希望刷新后继续之前的任务；
    
- 你需要子 Agent、后台任务或多入口接入；
    
- 压缩、记忆、审批、重试开始改动同一个主循环；
    
- 新功能上线时，你发现自己总在修改那段最不敢动的 `while` 循环。
    

最小的可借鉴版本，不需要很多抽象。你只要先做好四件事：

1. 把模型、工具、会话定义成稳定接口，而不是到处直接调用具体实现。
    
2. 为模型请求前和工具执行前后留出事件或中间件入口。
    
3. 把“模型实际看到的历史”当成可重建状态，而不是临时数组。
    
4. 只为真正会独立变化的能力建立 Provider，不为每个辅助函数创造插件。
    

当你能清楚回答“这项能力以后会不会换”“它有没有自己的启动和销毁时机”“是否会被多个模块使用”时，插件化就开始有价值。

反过来，如果一段代码只有一个调用方、永远跟着某个业务流程变化、拆开后仍要暴露大量内部细节，它更可能只是一个普通函数，而不是一种能力。

---

## 结尾：把变化请出核心循环

DeepSeek Harness 最值得理解的地方，不是某个模型适配器，也不是某个工具名字。

它提供了一种组织 Agent 系统的顺序：先用 Profile 决定装什么，用插件运行时管理生命周期，用 Agent Loop 推动最小任务流程，用事件日志保存共同事实，再用可替换能力接头承载模型、工具和执行环境的变化。

这条路不会让 Agent 系统天然变简单。

但它能让复杂度不再躲在一个越来越长、越来越不敢修改的循环里。

**一个 Agent 能走多远，取决于模型；一个 Agent 系统能长多大，取决于新增能力时还需不需要反复打开它的心脏。**

你现在的 Agent 项目里，权限、记忆、工具和重试是独立能力，还是还挤在同一个 `while` 循环里？

  

**留言**

写留言