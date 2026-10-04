import type { MessageReceiveOption } from "@openim/wasm-client-sdk";
import { useMutation } from "react-query";
import { v4 as uuidv4 } from "uuid";

import { useUserStore } from "@/store";
import createAxiosInstance from "@/utils/request";
import { getChatToken } from "@/utils/storage";

import { errorHandle } from "./errorHandle";
import { researchApi, researchMode } from "@/research/api";

const request = createAxiosInstance(import.meta.env.VITE_CHAT_URL);

const platform = window.electronAPI?.getPlatform() ?? 5;

const getAreaCode = (code?: string) =>
  code ? (code.includes("+") ? code : `+${code}`) : code;

// Send verification code
export const useSendSms = () => {
  return useMutation(
    (params: API.Login.SendSmsParams) =>
      request.post(
        "/account/code/send",
        {
          ...params,
        },
        {
          headers: {
            operationID: uuidv4(),
          },
        },
      ),
    {
      onError: errorHandle,
    },
  );
};

// Verify mobile phone number
export const useVerifyCode = () => {
  return useMutation(
    (params: API.Login.VerifyCodeParams) =>
      request.post(
        "/account/code/verify",
        {
          ...params,
          areaCode: getAreaCode(params.areaCode),
        },
        {
          headers: {
            operationID: uuidv4(),
          },
        },
      ),
    {
      onError: errorHandle,
    },
  );
};

// register
export const useRegister = () => {
  return useMutation(
    (params: API.Login.DemoRegisterType) =>
      request.post<{ chatToken: string; imToken: string; userID: string }>(
        "/account/register",
        {
          ...params,
          user: {
            ...params.user,
            areaCode: getAreaCode(params.user.areaCode),
          },
          platform,
        },
        {
          headers: {
            operationID: uuidv4(),
          },
        },
      ),
    {
      onError: errorHandle,
    },
  );
};

// reset passwords
export const useReset = () => {
  return useMutation(
    (params: API.Login.ResetParams) =>
      request.post(
        "/account/password/reset",
        {
          ...params,
          areaCode: getAreaCode(params.areaCode),
        },
        {
          headers: {
            operationID: uuidv4(),
          },
        },
      ),
    {
      onError: errorHandle,
    },
  );
};

// change password
export const modifyPassword = async (params: API.Login.ModifyParams) => {
  if (researchMode) throw new Error("科研账号暂未开放自助修改密码，请联系实验室负责人");
  const token = (await getChatToken()) as string;
  return request.post(
    "/account/password/change",
    {
      ...params,
    },
    {
      headers: {
        token,
        operationID: uuidv4(),
      },
    },
  );
};

// log in
export const useLogin = () => {
  return useMutation(
    (params: API.Login.LoginParams) =>
      request.post<{ chatToken: string; imToken: string; userID: string }>(
        "/account/login",
        {
          ...params,
          platform,
          areaCode: getAreaCode(params.areaCode),
        },
        {
          headers: {
            operationID: uuidv4(),
          },
        },
      ),
    {
      onError: errorHandle,
    },
  );
};

// Get user information
export interface BusinessUserInfo {
  userID: string;
  password: string;
  account: string;
  phoneNumber: string;
  areaCode: string;
  email: string;
  nickname: string;
  faceURL: string;
  gender: number;
  level: number;
  birth: number;
  allowAddFriend: BusinessAllowType;
  allowBeep: BusinessAllowType;
  allowVibration: BusinessAllowType;
  globalRecvMsgOpt: MessageReceiveOption;
}

export enum BusinessAllowType {
  Allow = 1,
  NotAllow = 2,
}

export const getBusinessUserInfo = async (userIDs: string[]) => {
  if (researchMode) {
    const { data } = await researchApi("imContacts");
    return { data: { users: data.contacts.filter(item => userIDs.includes(item.userID)).map(item => ({ userID: item.userID, nickname: item.contact.displayName } as BusinessUserInfo)) } };
  }
  const token = (await getChatToken()) as string;
  return request.post<{ users: BusinessUserInfo[] }>(
    "/user/find/full",
    {
      userIDs,
    },
    {
      headers: {
        operationID: uuidv4(),
        token,
      },
    },
  );
};

export const searchBusinessUserInfo = async (keyword: string) => {
  if (researchMode) {
    const { data } = await researchApi("imContacts");
    const users = data.contacts.filter(item => item.contact.displayName.includes(keyword) || item.userID === keyword).map(item => ({ userID: item.userID, nickname: item.contact.displayName } as BusinessUserInfo));
    return { data: { users, total: users.length } };
  }
  const token = (await getChatToken()) as string;
  return request.post<{ total: number; users: BusinessUserInfo[] }>(
    "/user/search/full",
    {
      keyword,
      pagination: {
        pageNumber: 1,
        showNumber: 1,
      },
    },
    {
      headers: {
        operationID: uuidv4(),
        token,
      },
    },
  );
};

interface UpdateBusinessUserInfoParams {
  email: string;
  nickname: string;
  faceURL: string;
  gender: number;
  birth: number;
  allowAddFriend: number;
  allowBeep: number;
  allowVibration: number;
  globalRecvMsgOpt: number;
}

export const updateBusinessUserInfo = async (
  params: Partial<UpdateBusinessUserInfoParams>,
) => {
  if (researchMode) throw new Error("请通过“我的资料”编辑科研档案；科研头像更新暂未开放");
  const token = (await getChatToken()) as string;
  return request.post<unknown>(
    "/user/update",
    {
      ...params,
      userID: useUserStore.getState().selfInfo?.userID,
    },
    {
      headers: {
        operationID: uuidv4(),
        token,
      },
    },
  );
};
