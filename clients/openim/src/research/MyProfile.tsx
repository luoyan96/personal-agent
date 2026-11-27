import { Alert, Button, Input } from "antd";
import { EditOutlined, IdcardOutlined } from "@ant-design/icons";
import { useState } from "react";
import OIMAvatar from "@/components/OIMAvatar";
import { useUserStore } from "@/store";
import { AcceptCatAccountNumber } from "./AcceptCatAccountNumber";
import { ContactCardShare } from "./ContactCardShare";
import { SettingsDisclosure } from "./SettingsDisclosure";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";
import { usePersonalOperation } from "./usePersonalOperation";

type ProfileDraft = {
  values: {
    displayName: string;
    introduction: string;
    capabilityDescription: string;
    personality: string;
  };
  version: number;
};
const profileFields = [
  ["introduction", "个人介绍", 2000],
  ["capabilityDescription", "研究方向与能力", 4000],
  ["personality", "名片上的交流介绍", 2000],
] as const;
const fields = [["displayName", "昵称", 200], ...profileFields] as const;

export function MyProfile() {
  const avatar = useUserStore((s) => s.selfInfo.faceURL);
  const actorId = useResearchStore((s) => s.actor?.member.id);
  const ownId = useResearchStore(
    (s) =>
      s.contacts.find(
        (e) =>
          e.contact.identity.kind === "human" &&
          e.contact.identity.memberId === s.actor?.member.id,
      )?.contact.id,
  );
  const read = useResearchRead(
    async (signal) => {
      const id =
        ownId ||
        (await researchApi("imContacts", { signal })).data.contacts.find(
          (e) =>
            e.contact.identity.kind === "human" &&
            e.contact.identity.memberId === actorId,
        )?.contact.id;
      if (!id) throw Error("当前个人资料暂不可读取，请重试。");
      return (await researchApi("chatContact", { params: { id }, signal })).data;
    },
    `my-profile:${actorId}`,
    !!actorId,
  );
  const contact = read.data;
  const [draft, setDraft] = useState<ProfileDraft>(),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(""),
    [notice, setNotice] = useState("");
  const operation = usePersonalOperation(true, `my-profile:${contact?.id}`);
  async function save() {
    if (!contact || !draft || busy || !draft.values.displayName.trim()) return;
    const { isCurrent } = operation.capture();
    setBusy(true);
    setFailure("");
    setNotice("");
    try {
      const result = await researchApi("updateContactProfile", {
        params: { id: contact.id },
        body: {
          ...draft.values,
          displayName: draft.values.displayName.trim(),
          expectedVersion: draft.version,
        },
      });
      if (!isCurrent()) return;
      useResearchStore.setState((s) => ({
        contacts: s.contacts.map((e) =>
          e.contact.id === result.data.id ? { ...e, contact: result.data } : e,
        ),
        actor: s.actor
          ? {
              ...s.actor,
              member: { ...s.actor.member, displayName: result.data.displayName },
            }
          : s.actor,
      }));
      useUserStore.getState().updateSelfInfo({ nickname: result.data.displayName });
      setDraft(undefined);
      setNotice("个人资料已保存。");
      await read.refresh();
    } catch (error) {
      if (isCurrent())
        setFailure(
          error instanceof Error ? error.message : "保存失败，填写内容已保留。",
        );
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }
  return (
    <section className="my-profile" aria-label="个人资料">
      <header className="my-section-heading">
        <div>
          <h2>个人资料</h2>
          <p>介绍自己，让同事和学生找到你。</p>
        </div>
        {contact && !draft && (
          <Button
            icon={<EditOutlined aria-hidden="true" />}
            onClick={() => {
              setDraft({
                values: {
                  displayName: contact.displayName,
                  introduction: contact.profile.introduction,
                  capabilityDescription: contact.profile.capabilityDescription,
                  personality: contact.profile.personality,
                },
                version: contact.profile.version,
              });
              setNotice("");
              setFailure("");
            }}
          >
            编辑资料
          </Button>
        )}
      </header>
      {read.error && (
        <Alert
          type="warning"
          message={read.error}
          action={<Button onClick={read.refresh}>重试读取</Button>}
        />
      )}
      {!contact && !read.error && <p role="status">正在读取个人资料…</p>}
      {failure && <Alert type="error" message={failure} />}
      {notice && (
        <p role="status" className="my-saved-notice">
          {notice}
        </p>
      )}
      {contact && (
        <>
          <div className="my-profile-account">
            <div className="my-profile-account-summary">
              <div className="my-profile-identity">
                <OIMAvatar src={avatar} text={contact.displayName} size={56} />
                <strong>{contact.displayName}</strong>
              </div>
              <AcceptCatAccountNumber username={contact.username} isSelf compact />
            </div>
            <SettingsDisclosure
              className="my-profile-share"
              label="分享我的名片"
              icon={<IdcardOutlined aria-hidden="true" />}
            >
              <ContactCardShare contact={contact} active />
            </SettingsDisclosure>
          </div>
          <section className="my-profile-details" aria-labelledby="my-profile-fields">
            <h3 id="my-profile-fields">{draft ? "编辑个人资料" : "名片资料"}</h3>
            {draft ? (
              <form
                className="my-profile-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void save();
                }}
              >
                {fields.map(([key, label, maxLength]) => (
                  <label key={key}>
                    {label}
                    <Input.TextArea
                      aria-label={label}
                      rows={key === "displayName" ? 1 : 3}
                      maxLength={maxLength}
                      value={draft.values[key]}
                      disabled={busy}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          values: { ...draft.values, [key]: event.target.value },
                        })
                      }
                    />
                  </label>
                ))}
                <div className="my-profile-actions">
                  <Button
                    onClick={() => {
                      setDraft(undefined);
                      setFailure("");
                    }}
                    disabled={busy}
                  >
                    取消编辑
                  </Button>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={busy}
                    disabled={!draft.values.displayName.trim()}
                  >
                    保存资料
                  </Button>
                </div>
              </form>
            ) : (
              <dl className="my-profile-facts">
                {profileFields.map(([key, label]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>
                      {contact.profile[key].trim() ? (
                        contact.profile[key]
                      ) : (
                        <span className="my-profile-blank">未填写</span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        </>
      )}
    </section>
  );
}
