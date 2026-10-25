#!/usr/bin/env bun

import { $ } from "bun"
import { mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

process.chdir(fileURLToPath(new URL("..", import.meta.url)))

const destination = path.resolve(process.env.OPENCODE_PACK_DIR ?? "../../dist/npm")
await mkdir(destination, { recursive: true })

const originalText = await Bun.file("package.json").text()
const pkg = JSON.parse(originalText) as {
  name: string
  version: string
  exports: Record<string, string | { import: string; types: string }>
  imports: Record<string, Record<string, string>>
}
const tarball = `${pkg.name.replace("@", "").replace("/", "-")}-${pkg.version}.tgz`
const output = (value: string, types = false) =>
  value.replace("./src/", types ? "./dist/types/" : "./dist/").replace(/\.ts$/, types ? ".d.ts" : ".js")

try {
  await $`bun run typecheck:tsc`
  await $`bun run build`
  pkg.exports = Object.fromEntries(
    Object.entries(pkg.exports).map(([key, value]) => {
      if (typeof value !== "string") return [key, value]
      return [key, { import: output(value), types: output(value, true) }]
    }),
  )
  pkg.imports = Object.fromEntries(
    Object.entries(pkg.imports).map(([key, conditions]) => [
      key,
      Object.fromEntries(
        Object.entries(conditions).map(([condition, value]) => [condition, output(value, condition === "types")]),
      ),
    ]),
  )
  await Bun.write("package.json", JSON.stringify(pkg, null, 2) + "\n")
  await rm(path.join(destination, tarball), { force: true })
  await $`bun pm pack --destination ${destination}`
} finally {
  await Bun.write("package.json", originalText)
}
