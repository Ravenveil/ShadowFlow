你现在用的是什么模式啊，中文给我翻一下，解释一下。
启动shadowflow的前后端吧，目前他是现在是一个什么状况？

---

先把这个单agent做好，然后再去做team。
单agent，先拿Hermes desk top来作为一个基础线。hermes：https://github.com/fathah/hermes-desktop

做好之后呢，再想办法去结合cherry studio，就是注入agentprompt等。
先去拿先拿Hermes desk top来作为一个基础线。hermes：https://github.com/fathah/hermes-desktop去跑多轮那个任务，把进行的前后端该有的功能都补上。
至少进行10轮或者20轮吧。中间不用问我，自己跑。
可以组建这个agent的团队去分工合作，具体怎么组建，由你自己来定。

团队里面做完了要有一个人负责检查和挑错。
流程大概是：调研----做----挑错，循环的一个形式吧。
中间可以使用各种各样的这个skill和MCP去做。你觉得怎么做比较好，用什么skill来做比较好都可以。中间每轮你可以使用不同的skill来进行一个检查或者去做。


直接在这个我们这个原有页面去改就行了，记得及时提交。不用再去搞新路由新前端，直接在本身这chat页面、路由上去改进。

我们的目标就是先去达到hermes：https://github.com/fathah/hermes-desktop水平，所以它的代码需要去看一下。

![tmp4964.png](file:///C:%5CUsers%5Cjy%5CAppData%5CLocal%5CTemp%5Ctmp4964.png)
把三栏中的右侧侧边栏重新梳理一下。
第二，精简一下。给你一个设计稿可以去参考一下侧边栏，先只看侧边栏吧。Use the claude_design MCP (https://api.anthropic.com/v1/design/mcp, auth via /design-login) to import this project:
https://claude.ai/design/p/14e4c884-d0d3-4f8b-aa74-2da17a1011c4?file=ShadowFlow+%E4%B8%89%E6%A0%8F%E5%B7%A5%E4%BD%9C%E5%8F%B0.dc.html

Implement: ShadowFlow 三栏工作台.dc.html
第三是根据classsco去丰富一下。包括丰富一下功能，丰富一下动画切换效果。目前没有动画的顺滑切换效果："D:\Users\jy\Videos\badicam\claws   go任务完成.mp4""D:\Users\jy\Videos\badicam\clawsgo.mp4   "
最右侧的侧边栏需要去搞一下。可以个人和团队一起来搞。



至少进行10轮或者20轮吧。中间不用问我，自己跑。
可以组建这个agent的团队去分工合作，具体怎么组建，由你自己来定。

团队里面做完了要有一个人负责检查和挑错。
流程大概是：调研----做----挑错，循环的一个形式吧。
中间可以使用各种各样的这个skill和MCP去做。你觉得怎么做比较好，用什么skill来做比较好都可以。中间每轮你可以使用不同的skill来进行一个检查或者去做。

---

![tmp6.png](file:///C:%5CUsers%5Cjy%5CAppData%5CLocal%5CTemp%5Ctmp6.png)
这个按钮应该删掉，嗯，因为新建绘画那里面就应该是包含了加西人
  工作，这个应该有功能用。嗯就是，应该这里应该是参考一下陈。

---

目标是把单 agent 对话做到 Hermes 水平。对话有很多需要修正的方向。对话主要是三栏中的中间栏，其次是左侧栏。包括这个agent图标，想下竞品怎么搞的，那种免费商用的图网站，把这个合适的图标放上，这个也可以做一下。
先拿Hermes desk top来作为一个基础线。hermes：https://github.com/fathah/hermes-desktop
把对话搞好。

可以根据classsco去丰富一下。包括丰富一下功能，丰富一下动画切换效果。目前没有动画的顺滑切换效果："D:\Users\jy\Videos\badicam\claws   go任务完成.mp4""D:\Users\jy\Videos\badicam\clawsgo.mp4   "

至少进行10轮或者20轮吧。中间不用问我，自己跑。
可以组建这个agent的团队去分工合作，具体怎么组建，由你自己来定。

团队里面做完了要有一个人负责检查和挑错。
流程大概是：调研----做----挑错，循环的一个形式吧。
中间可以使用各种各样的这个skill和MCP去做。你觉得怎么做比较好，用什么skill来做比较好都可以。中间每轮你可以使用不同的skill来进行一个检查或者去做。

对话框优先做clawsgo、hermes有的功能