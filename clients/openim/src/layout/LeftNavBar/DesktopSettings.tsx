import {
  CloudDownloadOutlined,
  ClockCircleOutlined,
  HistoryOutlined,
  RightOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { Badge, Modal, Popover } from "antd";
import { useState } from "react";
import { DesktopVersionPanel } from "./DesktopVersionPanel";
import DesktopUpdateButton from "./DesktopUpdateButton";
import { useDesktopUpdates } from "./useDesktopUpdates";

export default function DesktopSettings({
  onModelSettings,
  onMemory,
  onFollowups,
}: {
  onModelSettings: () => void;
  onMemory?: () => void;
  onFollowups?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false),
    [versionOpen, setVersionOpen] = useState(false);
  const updates = useDesktopUpdates();
  const hasUpdate =
    !!updates.state?.supported &&
    ["available", "downloading", "downloaded"].includes(updates.state.phase);

  const openVersion = () => {
    setMenuOpen(false);
    setVersionOpen(true);
    void updates.openCheck();
  };
  return (
    <>
      <Popover
        trigger="click"
        placement="rightBottom"
        arrow={false}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        content={
          <div className="desktop-settings-menu" aria-label="设置菜单">
            <button
              type="button"
              aria-label="模型设置"
              onClick={() => {
                setMenuOpen(false);
                onModelSettings();
              }}
            >
              <SettingOutlined />
              <span>模型设置</span>
              <RightOutlined />
            </button>
            {onMemory && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onMemory();
                }}
              >
                <HistoryOutlined />
                <span>记忆与偏好</span>
                <RightOutlined />
              </button>
            )}
            {onFollowups && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onFollowups();
                }}
              >
                <ClockCircleOutlined />
                <span>定时任务</span>
                <RightOutlined />
              </button>
            )}
            <button type="button" aria-label="版本更新" onClick={openVersion}>
              <CloudDownloadOutlined />
              <span>版本更新</span>
              {hasUpdate ? <Badge dot /> : <RightOutlined />}
            </button>
          </div>
        }
      >
        <button
          type="button"
          className="desktop-model-settings"
          aria-label="设置"
          aria-expanded={menuOpen}
        >
          <Badge dot={hasUpdate}>
            <SettingOutlined />
          </Badge>
          <span>设置</span>
        </button>
      </Popover>
      <DesktopUpdateButton updates={updates} />
      <Modal
        title="版本更新"
        open={versionOpen}
        onCancel={() => setVersionOpen(false)}
        footer={null}
        centered
        width={560}
      >
        <DesktopVersionPanel updates={updates} />
      </Modal>
    </>
  );
}
