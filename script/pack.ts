#!/usr/bin/env bun

import { Script } from "@opencode/script"
import { $ } from "bun"
import { rm } from "node:fs/promises"
import { fileURLToPath } from "url"

// Packs every npm package for a release build into dist/npm and the Linux and Node CLI archives
// into dist/archives. Publishing happens in the release workflow, which never runs this script.
process.chdir(fileURLToPath(new URL("..", import.meta.url)))
console.log(`=== packing ${Script.version} (${Script.channel}) ===\n`)

await rm("dist/npm", { recursive: true, force: true })
await rm("dist/archives", { recursive: true, force: true })

// Workspace dependencies are packed at their package.json version, so every package moves to the build version.
const pkgjsons = await Array.fromAsync(new Bun.Glob("**/package.json").scan({ absolute: true })).then((files) =>
  files.filter((file) => !file.includes("node_modules") && !file.includes("dist")),
)
for (const file of pkgjsons) {
  const text = await Bun.file(file).text()
  await Bun.write(file, text.replaceAll(/"version": "[^"]+"/g, `"version": "${Script.version}"`))
}
await $`bun install`

for (const name of [
  "schema",
  "codemode",
  "theme",
  "ai",
  "util",
  "protocol",
  "client",
  "plugin",
  "plugin-browser",
  "core",
  "simulation",
  "server",
  "sdk",
  "ui",
  "cli",
]) {
  console.log(`\n=== ${name} ===\n`)
  await $`bun ./packages/${name}/script/pack.ts`
}
