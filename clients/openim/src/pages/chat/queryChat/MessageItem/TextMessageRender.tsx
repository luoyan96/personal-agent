import { FC } from "react";

import SafeMessageMarkdown from "@/research/SafeMessageMarkdown";

import { IMessageItemProps } from ".";
import styles from "./message-item.module.scss";

const TextMessageRender: FC<IMessageItemProps> = ({ message }) => {
  const content = message.textElem?.content ?? "";

  return (
    <div className={styles.bubble}><SafeMessageMarkdown text={content} /></div>
  );
};

export default TextMessageRender;
