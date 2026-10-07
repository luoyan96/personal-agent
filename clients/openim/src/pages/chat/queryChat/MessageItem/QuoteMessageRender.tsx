import type { IMessageItemProps } from ".";
import SafeMessageMarkdown from "@/research/SafeMessageMarkdown";
import { readableMessage } from "@/research/chat-reply";
import styles from "./message-item.module.scss";

export default function QuoteMessageRender({ message }: IMessageItemProps) {
  const quote = message.quoteElem;
  return (
    <div className={styles.bubble}>
      <SafeMessageMarkdown text={quote?.text || ""} />
      {quote?.quoteMessage && (
        <blockquote className="desktop-message-quote">
          <strong>{quote.quoteMessage.senderNickname || "成员"}</strong>
          <p>{readableMessage(quote.quoteMessage) || "引用消息"}</p>
        </blockquote>
      )}
    </div>
  );
}
