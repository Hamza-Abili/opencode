#!/usr/bin/env bun

import { $ } from "bun"
import { mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import pkg from "../package.json"

process.chdir(fileURLToPath(new URL("..", import.meta.url)))

const destination = path.resolve(process.env.OPENCODE_PACK_DIR ?? "../../dist/npm")
await mkdir(destination, { recursive: true })

await $`bun run typecheck:tsc`
await $`bun run build`
const original = await Bun.file("package.json").text()
const tarball = `${pkg.name.replace("@", "").replace("/", "-")}-${pkg.version}.tgz`
try {
  await Bun.write(
    "package.json",
    JSON.stringify(
      {
        ...pkg,
        exports: Object.fromEntries(
          Object.entries(pkg.exports).map(([name, value]) => [
            name,
            {
              import: value.replace("./src/", "./dist/").replace(/\.ts$/, ".js"),
              types: value.replace("./src/", "./dist/").replace(/\.ts$/, ".d.ts"),
            },
          ]),
        ),
      },
      null,
      2,
    ) + "\n",
  )
  await rm(path.join(destination, tarball), { force: true })
  await $`bun pm pack --destination ${destination}`
} finally {
  await Bun.write("package.json", original)
}
