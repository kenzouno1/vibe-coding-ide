import { lazy } from "react";
import { Monitor } from "lucide-react";
import { registerPlugin } from "./plugin-registry";
import { useAppStore } from "@/stores/app-store";

registerPlugin({
  id: "ssh",
  name: "SSH",
  description: "Remote terminal & SFTP browser for server workflows",
  icon: Monitor,
  viewId: "ssh",
  ViewComponent: lazy(() =>
    import("@/components/ssh-panel").then((m) => ({ default: m.SshPanel })),
  ),
  shortcuts: [
    {
      key: "4",
      ctrl: true,
      label: "SSH",
      action: () => useAppStore.getState().setView("ssh"),
    },
  ],
  sidebarOrder: 40,
});
