import { Button } from "antd";
import { useNavigate } from "react-router-dom";

export function WorkspaceUnavailable({
  feature,
  pending,
  error,
  onRetry,
}: {
  feature: string;
  pending: boolean;
  error: string;
  onRetry: () => Promise<void>;
}) {
  const navigate = useNavigate();
  return (
    <section className="workspace-empty workspace-unavailable" role="status">
      <h2>
        {pending
          ? "正在检查服务…"
          : error
          ? "暂时无法连接服务"
          : `新版${feature}尚未启用`}
      </h2>
      <p>
        {pending
          ? "确认服务可用后，再读取你的资料。"
          : error || "服务器需要更新后才能使用此功能，你的账号和原有资料不受影响。"}
      </p>
      {!pending && (
        <div className="workspace-card-actions">
          <Button onClick={() => void onRetry()}>重新检查</Button>
          <Button type="primary" onClick={() => navigate("/chat")}>
            返回聊天
          </Button>
        </div>
      )}
    </section>
  );
}
