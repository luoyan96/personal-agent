import "@phosphor-icons/web/regular";
import "./style.css";

if (__DEMO__) {
  if(new URLSearchParams(location.search).get('chat-preview')==='1') void import('./chat-preview');
  else void import("./preview");
}
else void import("./collaboration");
