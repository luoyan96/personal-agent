import { Alert, Button } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { researchApi } from "./api";
import { usePersonalOperation } from "./usePersonalOperation";
import { findAssistantWorkTask, workbenchTaskPath } from "./workbench-links";

export function AssistantWorkTaskButton({
  conversationId,
  turnId,
}: {
  conversationId: string;
  turnId: string;
}) {
  const navigate = useNavigate();
  const operation = usePersonalOperation(
    true,
    `assistant-work-link:${conversationId}:${turnId}`,
  );
  const controller = useRef<AbortController>();
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  useLayoutEffect(() => {
    setBusy(false);
    setFailure("");
    return () => {
      controller.current?.abort();
      controller.current = undefined;
    };
  }, [operation.scope]);
  return (
    <>
      <Button
        size="small"
        loading={busy}
        onClick={async () => {
          if (controller.current) return;
          const { isCurrent } = operation.capture(),
            request = new AbortController();
          controller.current = request;
          setBusy(true);
          setFailure("");
          try {
            const id = await findAssistantWorkTask(
              { conversationId, turnId },
              researchApi,
              request.signal,
            );
            if (!isCurrent()) return;
            if (id) navigate(workbenchTaskPath(id));
            else
              setFailure(
                "尚未找到这次安排对应的工作台任务，可稍后重试或打开全部任务查看。",
              );
          } catch (error) {
            if (isCurrent())
              setFailure(
                error instanceof Error ? error.message : "任务定位失败，请重试。",
              );
          } finally {
            if (controller.current === request) controller.current = undefined;
            if (isCurrent()) setBusy(false);
          }
        }}
      >
        打开对应工作台任务
      </Button>
      {failure && (
        <Alert
          type="warning"
          message={failure}
          action={
            <Button size="small" onClick={() => navigate("/workbench?view=tasks")}>
              全部任务
            </Button>
          }
        />
      )}
    </>
  );
}
