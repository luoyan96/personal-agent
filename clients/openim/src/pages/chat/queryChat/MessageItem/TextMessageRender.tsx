import { FC } from "react";

import { formatBr } from "@/utils/common";

import { IMessageItemProps } from ".";
import styles from "./message-item.module.scss";

const TextMessageRender: FC<IMessageItemProps> = ({ message }) => {
  const content = message.textElem?.content ?? "";

  return (
    <div className={`${styles.bubble} whitespace-pre-wrap break-words`}>{content}</div>
  );
};

export default TextMessageRender;
