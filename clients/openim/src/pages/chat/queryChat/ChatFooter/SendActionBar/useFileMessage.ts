import { getSDK, type MessageItem } from "@openim/wasm-client-sdk";
import { v4 as uuidV4 } from "uuid";

import { IMSDK } from "@/layout/MainContentWrap";

export interface FileWithPath extends File {
  path?: string;
}

const assertMessage = (message: MessageItem | ""): MessageItem => {
  if (!message) {
    throw new Error("OpenIM SDK returned an empty image message");
  }
  return message;
};

export function useFileMessage() {
  const getImageMessage = async (file: FileWithPath) => {
    const { width, height } = await getPicInfo(file);
    const baseInfo = {
      uuid: uuidV4(),
      type: file.type,
      size: file.size,
      width,
      height,
      url: URL.createObjectURL(file),
    };

    if (window.electronAPI) {
      const imageMessage = assertMessage(
        (await IMSDK.createImageMessageFromFullPath(await localPath(file))).data,
      );
      if (!imageMessage.pictureElem) {
        throw new Error("OpenIM SDK returned an image message without pictureElem");
      }
      imageMessage.pictureElem.sourcePicture.url = baseInfo.url;
      return imageMessage;
    }
    const options = {
      sourcePicture: baseInfo,
      bigPicture: baseInfo,
      snapshotPicture: baseInfo,
      sourcePath: "",
      file,
    };

    // The official Electron render proxy excludes ByFile methods even when it
    // delegates login/send to WASM. getSDK returns that same official singleton,
    // so its browser File map and authenticated send/upload state stay shared.
    return (await getSDK().createImageMessageByFile(options)).data;
  };

  const getPicInfo = (file: File): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const _URL = window.URL || window.webkitURL;
      const img = new Image();
      const url = _URL.createObjectURL(file);
      img.onload = function () {
        _URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        _URL.revokeObjectURL(url);
        reject(new Error("无法读取所选图片"));
      };
      img.src = url;
    });

  const localPath = async (file: FileWithPath) =>
    file.path || (await window.electronAPI!.saveFileToDisk({ file, sync: true }));
  const getFileMessage = async (file: FileWithPath): Promise<MessageItem> => {
    if (window.electronAPI) {
      return assertMessage(
        (await IMSDK.createFileMessageFromFullPath(await localPath(file), file.name))
          .data,
      );
    }
    return (
      await getSDK().createFileMessageByFile({
        file,
        filePath: "",
        fileName: file.name,
        uuid: uuidV4(),
        sourceUrl: "",
        fileSize: file.size,
        fileType: file.type,
      })
    ).data;
  };
  const getSoundMessage = async (
    file: FileWithPath,
    duration: number,
  ): Promise<MessageItem> => {
    if (window.electronAPI) {
      return assertMessage(
        (await IMSDK.createSoundMessageFromFullPath(await localPath(file), duration))
          .data,
      );
    }
    return (
      await getSDK().createSoundMessageByFile({
        file,
        uuid: uuidV4(),
        soundPath: "",
        sourceUrl: "",
        dataSize: file.size,
        duration,
        soundType: file.type,
      })
    ).data;
  };

  return {
    getImageMessage,
    getFileMessage,
    getSoundMessage,
  };
}
