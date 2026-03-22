import type { PluginDescriptor } from "./plugin-types";

const plugins: PluginDescriptor[] = [];

export function registerPlugin(plugin: PluginDescriptor) {
  if (plugins.some((p) => p.id === plugin.id)) return;
  plugins.push(plugin);
}

export function getPlugins(): readonly PluginDescriptor[] {
  return plugins;
}

export function getPlugin(id: string): PluginDescriptor | undefined {
  return plugins.find((p) => p.id === id);
}
