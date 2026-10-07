import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, Layout } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import ContactSider from "@/pages/contact/ContactSider";
import { researchMode } from "@/research/api";

export const Contact = () => {
  const location = useLocation();
  const navigate = useNavigate();
  if (researchMode) {
    const main = location.pathname === "/contact" || location.pathname === "/contact/";
    const title = location.pathname.endsWith("newFriends") ? "好友申请" : location.pathname.endsWith("groupNotifications") ? "群邀请" : "我的群组";
    return <section className="desktop-contact-page" style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, minHeight: 0, background: "#fff" }}>
      {!main && <header style={{ padding: "16px 22px", borderBottom: "1px solid #e8e8e8", display: "flex", alignItems: "center", gap: 14 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate("/contact")} aria-label="返回通讯录" />
        <strong>{title}</strong>
      </header>}
      <Outlet />
    </section>;
  }
  return (
    <Layout className="relative z-0 flex-row">
      <ContactSider />
      <Outlet />
    </Layout>
  );
};
