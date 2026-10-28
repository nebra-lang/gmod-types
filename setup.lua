-- Setup script for fresh Garry's Mod addons.
--
-- Usage:
--   nebra create https://raw.githubusercontent.com/nebra-lang/gmod-types/main/setup.lua my-addon
--
-- Lays out an addon whose sources compile into lua/: an autorun file for the server, one for
-- the client and a shared one, with the server, client and shared sides configured by folder.
-- Imports compile to `include("path.lua")` from the lua/ folder, the way GMod loads files.

local function projectNameFromCwd()
    local cwd = project.cwd() or "."
    if cwd:sub(-1) == "/" then cwd = cwd:sub(1, -2) end
    local name = cwd:match("([^/\\]+)$") or "gmod-addon"
    return (name:gsub("[^%w%-_]", "-"))
end

local projectName = projectNameFromCwd()
local fileName = projectName:gsub("%-", "_"):lower()
print("Scaffolding Garry's Mod addon: " .. projectName)

project.writeConfig("nebra.toml", {
    name = projectName,
    version = "0.1.0",
    target = "jit",
    source = "src",
    output = "lua",
    generate_declarations = false,
    dependencies = {
        ["gmod-types"] = "github:nebra-lang/gmod-types",
    },
    code = {
        import_statement = "include(%s)",
        import_extension = ".lua",
        import_path = "root",
        index_base = 1,
    },
    sides = {
        ["src/autorun/server/**"] = { "server", "shared" },
        ["src/autorun/client/**"] = { "client", "shared" },
        ["src/**"] = { "shared" },
    },
})

project.writeFile("src/autorun/" .. fileName .. "_shared.neb", [[
print("]] .. projectName .. [[ loaded")
]])

project.writeFile("src/autorun/server/" .. fileName .. "_init.neb", [[
hook.Add("PlayerSpawn", "]] .. projectName .. [[.Spawn", function(ply)
    ply:ChatPrint("Welcome, " .. ply:Nick())
end)
]])

project.writeFile("src/autorun/client/" .. fileName .. "_init.neb", [[
hook.Add("HUDPaint", "]] .. projectName .. [[.Hud", function()
    draw.SimpleText("]] .. projectName .. [[", "DermaDefault", 10, 10, new Color(255, 255, 255))
end)
]])

project.writeFile("addon.json", [[
{
    "title": "]] .. projectName .. [[",
    "type": "tool",
    "tags": [],
    "ignore": ["src/*", "nebra_modules/*", "nebra.toml", "nebra.lock"]
}
]])

project.writeGitignore(".gitignore", { "lua/" })

local installOk = project.installDeps(nil, false)
if not installOk then
    print("Installing the dependencies failed; run `nebra install` once the network is reachable.")
end

print("")
print("Created:")
print("  nebra.toml                                -- Nebra build config, sides by folder")
print("  src/autorun/" .. fileName .. "_shared.neb      -- runs on both")
print("  src/autorun/server/" .. fileName .. "_init.neb -- runs on the server")
print("  src/autorun/client/" .. fileName .. "_init.neb -- runs on the client")
print("  addon.json                                -- the addon manifest")
print("")
print("Build with `nebra build`; the Lua lands in lua/, ready for garrysmod/addons/.")
