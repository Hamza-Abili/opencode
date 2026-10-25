#!/usr/bin/env bun

import { $ } from "bun"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
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
  imports?: Record<string, Record<string, string>>
}
const tarball = `${pkg.name.replace("@", "").replace("/", "-")}-${pkg.version}.tgz`
const output = (value: string, types = false) =>
  value.replace("./src/", "./dist/").replace(/\.ts$/, types ? ".d.ts" : ".js")

try {
  await $`bun run typecheck:tsc`
  await $`bun run build`
  pkg.exports = Object.fromEntries(
    Object.entries(pkg.exports).map(([key, value]) => {
      if (typeof value !== "string") return [key, value]
      return [
        key,
        {
          import: output(value),
          types: output(value, true),
        },
      ]
    }),
  )
  if (pkg.imports) {
    pkg.imports = Object.fromEntries(
      Object.entries(pkg.imports).map(([key, conditions]) => [
        key,
        Object.fromEntries(Object.entries(conditions).map(([condition, value]) => [condition, output(value)])),
      ]),
    )
  }
  await Bun.write("package.json", JSON.stringify(pkg, null, 2) + "\n")
  await rm(path.join(destination, tarball), { force: true })
  await $`bun pm pack --destination ${destination}`
  const consumer = await mkdtemp(path.join(tmpdir(), "opencode-codemode-"))
  try {
    await Bun.write(
      path.join(consumer, "package.json"),
      JSON.stringify({
        private: true,
        type: "module",
        dependencies: { [pkg.name]: `file:${path.join(destination, tarball)}` },
      }),
    )
    await $`npm install --ignore-scripts --no-audit --no-fund`.cwd(consumer)
    await $`node --input-type=module -e ${`await import(${JSON.stringify(pkg.name)})`}`.cwd(consumer)
    await $`bun --conditions=workerd -e ${`await import(${JSON.stringify(pkg.name)})`}`.cwd(consumer)
  } finally {
    await rm(consumer, { recursive: true, force: true })
  }
} finally {
  await Bun.write("package.json", originalText)
}
