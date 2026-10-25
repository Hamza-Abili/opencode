#!/usr/bin/env bun
import { $ } from "bun"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "url"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

const destination = path.resolve(process.env.OPENCODE_PACK_DIR ?? "../../dist/npm")
await mkdir(destination, { recursive: true })

await $`bun run build`
const originalText = await Bun.file("package.json").text()
const pkg = JSON.parse(originalText) as {
  name: string
  version: string
  exports: Record<string, string>
  imports: Record<string, Record<string, string>>
}
for (const [key, value] of Object.entries(pkg.exports)) {
  const file = value.replace("./src/", "./dist/").replace(".ts", "")
  // @ts-ignore
  pkg.exports[key] = {
    import: file + ".js",
    types: file + ".d.ts",
  }
}
pkg.imports = Object.fromEntries(
  Object.entries(pkg.imports).map(([key, conditions]) => [
    key,
    Object.fromEntries(
      Object.entries(conditions).map(([condition, value]) => [
        condition,
        value.replace("./src/", "./dist/").replace(/\.ts$/, ".js"),
      ]),
    ),
  ]),
)
await Bun.write("package.json", JSON.stringify(pkg, null, 2))
try {
  await $`bun pm pack --destination ${destination}`
} finally {
  await Bun.write("package.json", originalText)
}
