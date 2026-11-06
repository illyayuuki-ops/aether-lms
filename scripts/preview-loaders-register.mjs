/** Registers scripts/preview-loaders.mjs as a module resolve hook. */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = process.env.PREVIEW_ROOT || process.cwd();
register(pathToFileURL(path.join(root, "scripts", "preview-loaders.mjs")).href, import.meta.url);
