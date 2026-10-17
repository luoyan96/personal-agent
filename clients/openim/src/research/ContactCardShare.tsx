import { CopyOutlined } from "@ant-design/icons";
import { Button, Input, type InputRef } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import type { Contact } from "@research-agent-platform/contracts";
import { makeContactCard, readContactServiceOrigin } from "./contact-card";
import { usePersonalOperation } from "./usePersonalOperation";
import "./contact-card.scss";

export function ContactCardShare({
  contact,
  active,
}: {
  contact: Contact;
  active: boolean;
}) {
  const operation = usePersonalOperation(
    active,
    `contact-card:${contact.id}:${contact.version}:${contact.profile.version}`,
  );
  const input = useRef<InputRef>(null),
    inFlight = useRef(false);
  const [result, setResult] = useState<{
    scope: string;
    text: string;
    state: "copying" | "copied" | "manual" | "error";
    error?: string;
  }>();
  const current = result?.scope === operation.scope ? result : undefined;
  useLayoutEffect(() => {
    inFlight.current = false;
    setResult(undefined);
  }, [operation.scope]);
  const copy = async () => {
    if (inFlight.current) return;
    const { isCurrent } = operation.capture();
    if (!isCurrent()) return;
    inFlight.current = true;
    setResult({ scope: operation.scope, text: "", state: "copying" });
    let text = "";
    try {
      const origin = await readContactServiceOrigin();
      if (!isCurrent()) return;
      text = makeContactCard(contact, origin);
      await navigator.clipboard.writeText(text);
      if (isCurrent()) setResult({ scope: operation.scope, text, state: "copied" });
    } catch (error) {
      if (isCurrent())
        setResult({
          scope: operation.scope,
          text,
          state: text ? "manual" : "error",
          error: error instanceof Error ? error.message : "名片暂不可用，请重试。",
        });
    } finally {
      if (isCurrent()) inFlight.current = false;
    }
  };
  useLayoutEffect(() => {
    if (current?.state === "manual") input.current?.focus({ cursor: "all" });
  }, [current?.state, current?.text]);
  return (
    <section className="acceptcat-contact-share" aria-label="分享联系人名片">
      <div className="acceptcat-contact-share-heading">
        <strong>分享名片</strong>
        <Button
          icon={<CopyOutlined />}
          loading={current?.state === "copying"}
          aria-label="复制名片"
          onClick={() => void copy()}
        >
          {current?.state === "copied" ? "已复制" : "复制名片"}
        </Button>
      </div>
      <p>
        发给同事后，对方在“通讯录 → 添加”粘贴即可查找。
        {contact.identity.kind === "personal_agent" && "添加 Agent 需要主人单独同意。"}
        {contact.identity.kind === "public_agent" && "公开能力按课题组实际权限使用。"}
      </p>
      {current?.state === "error" && <p role="alert">{current.error}</p>}
      {current?.text && (
        <>
          <p role="status">
            {current.state === "copied"
              ? contact.identity.kind === "public_agent"
                ? "名片已复制；可用范围以课题组授权为准。"
                : "名片已复制；添加仍需对方同意。"
              : "未能自动复制，名片已选中，请按 Ctrl+C 复制。"}
          </p>
          <Input.TextArea
            ref={input}
            aria-label="名片内容"
            readOnly
            value={current.text}
            rows={4}
            onFocus={(event) => event.target.select()}
          />
        </>
      )}
    </section>
  );
}
