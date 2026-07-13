const fs = require("fs");
const path = require("path");

const root = "c:/Users/trind/Desktop/dashboards";

function walk(d, acc = []) {
  for (const n of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, n.name);
    if (n.isDirectory()) {
      if (["node_modules", ".git"].includes(n.name)) continue;
      walk(p, acc);
    } else if (/\.(html|js|ejs)$/.test(n.name)) {
      acc.push(p);
    }
  }
  return acc;
}

let fixed = 0;
for (const f of walk(root)) {
  let s = fs.readFileSync(f, "utf8");
  if (!s.includes("tableWidth: 'auto'")) continue;
  const before = s;
  // keep a single tableWidth after margin; drop the one jammed next to styles
  s = s.replace(
    /overflow: 'linebreak' \}, tableWidth: 'auto',/g,
    "overflow: 'linebreak' },"
  );
  // if styles line still has duplicate elsewhere, noop
  if (s !== before) {
    fs.writeFileSync(f, s);
    fixed++;
    console.log("fixed", path.relative(root, f));
  }
}
console.log("done", fixed);
