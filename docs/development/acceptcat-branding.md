# AcceptCat 品牌与科研方向调整

日期：2026-10-08。分支feature/acceptcat-branding，基于7e49368；本批是Windows0.6.1本地候选，公开Release与API / worker仍为0.6.0 / 11cd20a，contract0.22 / chat1.11 / schema21。没有服务器部署或数据库迁移。

## 名称和兼容

界面使用AcceptCat，定位为“科研个人助理与课题组协作”。覆盖原生窗口、标题栏、登录与服务连接、设置版本页、托盘、更新确认、启动页和安装元数据。Windows安装文件AcceptCat_0.6.1.exe，快捷方式AcceptCat；renderer与原生各用纯品牌配置，打包检查核对二者名称一致。

保持NSIS appId、package.name、默认Electron数据目录身份和公开GitHub更新源；没有调用app.setName改变数据位置。更新资格兼容Uninstall ResearchWeChat.exe和Uninstall AcceptCat.exe。真实旧安装版覆盖升级、快捷方式迁移及安装重启尚未执行；不能把安装标记测试当成实际升级完成。

科研方向见[产品规划v0.8](../product-plan.md)。近期优先Windows上稳定聊天与文件、持续课题及学生协作、可检查的科研产出、跟进与背景复用；广泛消费者场景和移动扩展后置。本批只改名称与方向文档，不代表新科研工具或完整自动协作已经实现。

## 本地验证

renderer / Electron类型、8项更新与服务地址检查、实际Windows NSIS构建、安装文件 / blockmap / latest.yml校验，以及隔离打包Electron22启动与登录品牌检查。检查最终结果、安装校验和与证据位置见[当前状态](../current-state.md)。未重复共享核心CI：本批没有改共享核心、契约或Skill内容。

第一次Electron类型检查暴露跨项目品牌文件未列入编译范围，以及旧Node模块解析无法读取Skill包exports；已改为Bundler解析。第一次打包启动发现src中的品牌文件未进入原生打包清单；移入原生后，renderer直接引用又触发项目声明输出要求。最终两端各使用独立纯配置，并在实际包核对名称；失败记录保留，不计为通过。Browser原生桌面控制不可用，使用隔离Playwright Electron直接检查实际包；不使用本人账号、Key、研究材料或已安装软件的数据。

## 后续

当前候选未发布到更新源。发布时沿用既有固定源和完整资产校验；科研下一批先围绕一个真实课题验证导师交代、学生 / Agent承接、阶段成果、反馈与继续推进。绘图Skill的真实脚本 / 图片执行仍是独立工作。
