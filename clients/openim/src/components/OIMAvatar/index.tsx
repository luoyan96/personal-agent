import { Avatar as AntdAvatar, AvatarProps } from "antd";
import clsx from "clsx";
import * as React from "react";
import { useMemo } from "react";

import default_group from "@/assets/images/contact/group.png";
import { avatarList, getDefaultAvatar } from "@/utils/avatar";

const default_avatars = avatarList.map((item) => item.name);

interface IOIMAvatarProps extends AvatarProps {
  text?: string;
  color?: string;
  bgColor?: string;
  isgroup?: boolean;
  isnotification?: boolean;
  size?: number;
}

const OIMAvatar = React.forwardRef<HTMLSpanElement, IOIMAvatarProps>((props, ref) => {
  const {
    src,
    text,
    size = 42,
    color = "#fff",
    bgColor = "#0289FA",
    isgroup = false,
  } = props;
  const [errorHolder, setErrorHolder] = React.useState<string>();
  const nativeFallback = Boolean(window.electronAPI && !src && !isgroup && text);
  const label = nativeFallback
    ? /个人助理/.test(text!) ? "助理" : Array.from(text!).slice(0, 2).join("")
    : text;
  const palette = ["#dce7f8", "#e5e0f3", "#dcece6", "#f4e6d9", "#dee9ed"];
  const hash = Array.from(text || "").reduce((value, char) => value + char.codePointAt(0)!, 0);

  const getAvatarUrl = useMemo(() => {
    if (src) {
      if (default_avatars.includes(src as string))
        return getDefaultAvatar(src as string);

      return src;
    }
    return isgroup ? default_group : undefined;
  }, [src, isgroup]);

  const avatarProps = { ...props, isgroup: undefined, isnotification: undefined };

  React.useEffect(() => {
    if (!isgroup) {
      setErrorHolder(undefined);
    }
  }, [isgroup]);

  const errorHandler = () => {
    if (isgroup) {
      setErrorHolder(default_group);
    }
    return false;
  };

  return (
    <AntdAvatar
      ref={ref}
      style={{
        backgroundColor: nativeFallback && !props.bgColor ? palette[hash % palette.length] : bgColor,
        minWidth: `${size}px`,
        minHeight: `${size}px`,
        lineHeight: `${size - 2}px`,
        color: nativeFallback && !props.color ? "#475b73" : color,
        fontSize: nativeFallback ? Math.max(14, Math.round(size * .35)) : undefined,
        fontWeight: nativeFallback ? 600 : undefined,
        borderRadius: window.electronAPI ? "50%" : undefined,
      }}
      shape="square"
      {...avatarProps}
      className={clsx(
        {
          "cursor-pointer": Boolean(props.onClick),
        },
        props.className,
      )}
      src={errorHolder ?? getAvatarUrl}
      onError={errorHandler}
    >
      {label}
    </AntdAvatar>
  );
});

export default OIMAvatar;
