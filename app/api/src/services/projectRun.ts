import JSZip from "jszip";

type ProjectFile = {
  path: string;
  content: string;
};

type Project = {
  entryPath: string;
  files: ProjectFile[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseProject(
  input: unknown,
  language: "python" | "javascript"
): Project {
  if (
    !isRecord(input) ||
    typeof input.entryPath !== "string" ||
    !Array.isArray(input.files) ||
    input.files.length < 1 ||
    input.files.length > 50
  ) {
    throw new Error("Provide an entry file and between 1 and 50 files.");
  }

  const extension = language === "python" ? ".py" : ".js";
  const files: ProjectFile[] = [];
  const paths = new Set<string>();
  let totalBytes = 0;

  for (const item of input.files) {
    if (
      !isRecord(item) ||
      typeof item.path !== "string" ||
      typeof item.content !== "string"
    ) {
      throw new Error("Each project file needs a path and text content.");
    }

    const parts = item.path.split("/");
    const validPath =
      item.path.length <= 240 &&
      item.path.endsWith(extension) &&
      parts.every((part) => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(part));

    if (!validPath) {
      throw new Error(`Invalid ${language} project path: ${item.path}`);
    }

    const key = item.path.toLowerCase();
    if (paths.has(key)) {
      throw new Error(`Two files have the same path: ${item.path}`);
    }

    totalBytes += Buffer.byteLength(item.content, "utf8");
    if (totalBytes > 50_000) {
      throw new Error("Project source exceeds the 50 KB run limit.");
    }

    paths.add(key);
    files.push({ path: item.path, content: item.content });
  }

  // A ZIP cannot use one path as both a file and a directory.
  for (const file of files) {
    const parts = file.path.toLowerCase().split("/");
    parts.pop();

    while (parts.length > 0) {
      if (paths.has(parts.join("/"))) {
        throw new Error(`A file blocks the folder path for ${file.path}.`);
      }
      parts.pop();
    }
  }

  const entry = files.find((file) => file.path === input.entryPath);
  if (!entry || !entry.content.trim()) {
    throw new Error("The project entry file is missing or empty.");
  }

  return { entryPath: entry.path, files };
}

export function prepareProjectSubmission(
  project: Project,
  language: "python" | "javascript"
): { source_code: string } {
  // Encode filenames and contents as data so quotes, backticks,
  // Unicode, and newlines survive inside the generated launcher.
  const payload = Buffer.from(
    JSON.stringify(project),
    "utf8"
  ).toString("base64");

  const launcher =
    language === "python"
      ? [
          "import base64, json, os, runpy, sys, tempfile",
          `project = json.loads(base64.b64decode("${payload}"))`,
          "os.chdir(tempfile.mkdtemp())",
          "",
          'for file in project["files"]:',
          '    path = file["path"]',
          '    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)',
          '    with open(path, "w", encoding="utf-8") as output:',
          '        output.write(file["content"])',
          "",
          'entry = os.path.abspath(project["entryPath"])',
          "sys.path.insert(0, os.path.dirname(entry))",
          "sys.argv = [entry]",
          'runpy.run_path(entry, run_name="__main__")',
        ].join("\n")
      : [
          'const fs = require("fs");',
          'const path = require("path");',
          'const os = require("os");',
          `const project = JSON.parse(Buffer.from("${payload}", "base64").toString("utf8"));`,
          'process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "project-")));',
          "",
          "for (const file of project.files) {",
          "  fs.mkdirSync(path.dirname(file.path), { recursive: true });",
          '  fs.writeFileSync(file.path, file.content, "utf8");',
          "}",
          "",
          "process.argv[1] = path.resolve(project.entryPath);",
          'require("module").runMain();',
        ].join("\n");

  return {
    source_code: Buffer.from(launcher, "utf8").toString("base64"),
  };
}