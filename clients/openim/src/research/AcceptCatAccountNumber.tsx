import { CopyOutlined } from "@ant-design/icons";
import { Button, Input, type InputRef } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import { usePersonalOperation } from "./usePersonalOperation";
import "./account-number.scss";

/** The public account number is the existing username, never an internal contact/IM ID. */
export function AcceptCatAccountNumber({
  username,
  isSelf = false,
  active = true,
}: {
  username: string | null | undefined;
  isSelf?: boolean;
  active?: boolean;
}) {
  const operation = usePersonalOperation(active, `account-number:${username || ""}`);
  const input = useRef<InputRef>(null),
    inFlight = useRef(false);
  const [feedback, setFeedback] = useState<{
    scope: string;
    state: "copying" | "copied" | "manual";
  }>();
  const current = feedback?.scope === operation.scope ? feedback.state : undefined;
  useLayoutEffect(() => {
    inFlight.current = false;
    setFeedback(undefined);
  }, [operation.scope]);
  const copy = async () => {
    if (!username || inFlight.current) return;
    const { isCurrent } = operation.capture();
    if (!isCurrent()) return;
    inFlight.current = true;
    setFeedback({ scope: operation.scope, state: "copying" });
    try {
      await navigator.clipboard.writeText(username);
      if (isCurrent()) setFeedback({ scope: operation.scope, state: "copied" });
    } catch {
      if (isCurrent()) {
        setFeedback({ scope: operation.scope, state: "manual" });
        input.current?.focus({ cursor: "all" });
      }
    } finally {
      if (isCurrent()) inFlight.current = false;
    }
  };
  return (
    <section
      className="acceptcat-account-number"
      aria-label={isSelf ? "我的 AcceptCat 号" : "AcceptCat 号"}
    >
      <div className="acceptcat-account-label">
        {isSelf ? "我的 AcceptCat 号" : "AcceptCat 号"}
      </div>
      {username ? (
        <>
          <div className="acceptcat-account-value">
            <Input
              ref={input}
              aria-label={isSelf ? "我的 AcceptCat 号" : "AcceptCat 号"}
              value={username}
              readOnly
              onFocus={(event) => event.target.select()}
            />
            <Button
              icon={<CopyOutlined />}
              loading={current === "copying"}
              onClick={() => void copy()}
              aria-label={isSelf ? "复制我的 AcceptCat 号" : "复制 AcceptCat 号"}
            >
              {current === "copied" ? "已复制" : "复制"}
            </Button>
          </div>
          <p className="acceptcat-account-help">
            {isSelf
              ? "把这个号发给同事，对方可在通讯录中添加你。"
              : "输入此号可查找联系人。"}
            区分大小写。
          </p>
          {current === "copied" && (
            <p role="status" className="acceptcat-account-feedback">
              AcceptCat 号已复制
            </p>
          )}
          {current === "manual" && (
            <p role="status" className="acceptcat-account-feedback">
              未能自动复制，号码已选中，请按 Ctrl+C 复制。
            </p>
          )}
        </>
      ) : (
        <p role="status" className="acceptcat-account-help">
          AcceptCat 号暂未读取，请刷新资料后重试。
        </p>
      )}
    </section>
  );
}
