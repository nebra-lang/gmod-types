# gmod-types

[Nebra](https://github.com/nebra-lang/nebra) type declarations for **[Garry's Mod](https://gmod.facepunch.com)**.

Types-only package: it emits no Lua. The declarations are auto-discovered from `nebra_modules/`
once the package is installed.

## Install

```bash
nebra add github:nebra-lang/gmod-types
```

Or scaffold a fresh addon that already has everything wired up:

```bash
nebra create https://raw.githubusercontent.com/nebra-lang/gmod-types/main/setup.lua my-addon
```

The setup script writes a `nebra.toml` targeting LuaJIT that compiles `src/` into `lua/`, with an
autorun file for the server, one for the client and a shared one. Imports compile to
`include("path.lua")` from `lua/`, the way GMod loads files, and the sides are configured by
folder, so calling a client-only function from a server file is a compile error.

## What you get

**The full API** in `src/gmod.d.neb`, generated from the
[Garry's Mod wiki](https://wiki.facepunch.com/gmod) as scraped by
[glua-api-snippets](https://github.com/luttje/glua-api-snippets): the classes (`Entity`, `Player`
extending it, `Vector`, `Angle`, ...), the panels with their inheritance, the libraries, the
global functions, the structures and the enumerations, each with its documentation and realm.

**Realms as sides.** Every function carries the realm the wiki gives it as `@side(client)`,
`@side(server)` or `@side(shared)`; menu functions count as client.

**Typed hooks.** `hook.Add` takes the gamemode event it names and a callback typed by it:

```lua
hook.Add("PlayerSpawn", "MyAddon.Spawn", function(ply, transition)
    ply:ChatPrint("Welcome " .. ply:Nick())     -- ply: Player
end)

hook.Add("MyAddon.Custom", "listener", function(...) end)   -- custom events take any name
```

The same goes for a gamemode, `function GM:PlayerSpawn(ply)`, and for scripted entities and
weapons, `function ENT:Initialize()` and `function SWEP:PrimaryAttack()`, where `self` is the
entity or weapon.

**Typed panels.** `vgui.Create("DFrame")` returns a `DFrame`.

**Constructors.** `Vector`, `Angle`, `Color`, `Entity` and `Player` are classes; `new Vector(1, 2, 3)`
compiles to `Vector(1, 2, 3)`.

**GMod's additions to the standard library**, such as `math.Clamp`, `string.Explode` and
`table.Count`, are added to Nebra's `math`, `string` and `table`.

**Enumerations** are global constants, as in GMod: `HUD_PRINTTALK`, `SOLID_VPHYSICS`.

## Regenerating the declarations

The wiki data lives in `api/wiki.json`. To refresh it from the latest glua-api-snippets release
and regenerate:

```bash
gh release download -R luttje/glua-api-snippets -p "*.json.zip" -D /tmp/glua
unzip /tmp/glua/*.json.zip -d /tmp/glua/pages
cd generate
node merge-api.js /tmp/glua/pages
node generate.js
```

`generate.js` rewrites `src/gmod.d.neb`. Do not hand-edit that file, the next generator run will
overwrite it.

## Related

- [Nebra](https://github.com/nebra-lang/nebra) - the compiler and toolchain
- [Documentation](https://nebra-lang.github.io) - language reference and guides
