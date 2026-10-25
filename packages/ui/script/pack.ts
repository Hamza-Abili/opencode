#!/usr/bin/env bun

import { $ } from "bun"
import { mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

process.chdir(fileURLToPath(new URL("..", import.meta.url)))

const destination = path.resolve(process.env.OPENCODE_PACK_DIR ?? "../../dist/npm")
await mkdir(destination, { recursive: true })

const original = await Bun.file("package.json").text()

const pkg = JSON.parse(original) as {
  name: string
  version: string
  exports: Record<string, string | { types: string; import: string }>
}

const tarball = path.join(destination, `${pkg.name.replace("@", "").replace("/", "-")}-${pkg.version}.tgz`)

await $`bun run typecheck:tsc`
await $`bun run build`
pkg.exports = Object.fromEntries(
  Object.entries(pkg.exports).map(([key, value]) => {
    if (typeof value !== "string" || (!value.endsWith(".ts") && !value.endsWith(".tsx"))) return [key, value]

    return [
      key,
      {
        types: value.replace("./src/", "./dist/").replace(/\.tsx?$/, ".d.ts"),
        import: value,
      },
    ]
  }),
)

await rm(tarball, { force: true })
await Bun.write("package.json", JSON.stringify(pkg, null, 2) + "\n")

try {
  await $`bun pm pack --destination ${destination}`
} finally {
  await Bun.write("package.json", original)
}
