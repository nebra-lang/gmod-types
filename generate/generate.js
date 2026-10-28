#!/usr/bin/env node
'use strict';

// Reads the scraped Garry's Mod wiki from ../api/wiki.json and emits the Nebra declarations at
// ../src/gmod.d.neb. Run merge-api.js first to refresh the wiki data.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const API_PATH = path.join(ROOT, 'api', 'wiki.json');
const OUT_PATH = path.join(ROOT, 'src', 'gmod.d.neb');

const NEBRA_KEYWORDS = new Set([
    'abstract', 'and', 'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'constructor',
    'continue', 'declare', 'defer', 'do', 'else', 'elseif', 'end', 'enum', 'export', 'extend',
    'extends', 'false', 'finally', 'for', 'from', 'function', 'goto', 'guard', 'if', 'implements',
    'import', 'in', 'instanceof', 'interface', 'keyof', 'local', 'match', 'meta', 'module', 'mut',
    'new', 'nil', 'not', 'or', 'override', 'protected', 'repeat', 'return', 'static', 'super',
    'then', 'true', 'try', 'typeof', 'until', 'when', 'while',
]);

// The libraries the standard library declares already, with the members it declares; GMod's
// additions are merged into the same interface, leaving out what it has.
const STDLIB = {
    string: { iface: 'StringLib', members: ['byte', 'char', 'dump', 'find', 'format', 'gmatch', 'gsub', 'len', 'lower', 'match', 'pack', 'packsize', 'rep', 'reverse', 'sub', 'unpack', 'upper'] },
    table: { iface: 'TableLib', members: ['concat', 'getn', 'insert', 'maxn', 'move', 'pack', 'remove', 'sort', 'unpack'] },
    math: { iface: 'MathLib', members: ['abs', 'acos', 'asin', 'atan', 'atan2', 'ceil', 'cos', 'cosh', 'deg', 'exp', 'floor', 'fmod', 'frexp', 'huge', 'ldexp', 'log', 'log10', 'max', 'maxinteger', 'min', 'mininteger', 'modf', 'pi', 'pow', 'rad', 'random', 'randomseed', 'sin', 'sinh', 'sqrt', 'tan', 'tanh', 'tointeger', 'type', 'ult'] },
    os: { iface: 'OsLib', members: ['clock', 'date', 'difftime', 'execute', 'exit', 'getenv', 'remove', 'rename', 'setlocale', 'time', 'tmpname'] },
    coroutine: { iface: 'CoroutineLib', members: ['close', 'create', 'isyieldable', 'resume', 'running', 'status', 'wrap', 'yield'] },
    debug: { iface: 'DebugLib', members: ['debug', 'gethook', 'getinfo', 'getlocal', 'getmetatable', 'getregistry', 'getupvalue', 'getuservalue', 'sethook', 'setlocal', 'setmetatable', 'setupvalue', 'setuservalue', 'traceback', 'upvalueid', 'upvaluejoin'] },
    package: { iface: 'PackageLib', members: ['config', 'cpath', 'loaded', 'loaders', 'loadlib', 'path', 'preload', 'searchers', 'searchpath', 'seeall'] },
    bit: { iface: 'BitLib', members: ['arshift', 'band', 'bnot', 'bor', 'btest', 'bxor', 'extract', 'lrotate', 'lshift', 'replace', 'rrotate', 'rshift', 'tobit', 'tohex'] },
    jit: { iface: 'JitLib', members: ['arch', 'attach', 'flush', 'off', 'on', 'os', 'status', 'version', 'version_num'] },
    http: { iface: 'HttpLib', members: ['get', 'post', 'put', 'patch', 'delete', 'request', 'postjson', 'download', 'getString'] },
};

// The global functions the standard library declares already.
const STDLIB_GLOBALS = new Set(['assert', 'collectgarbage', 'dofile', 'error', 'getmetatable', 'ipairs', 'load', 'loadfile',
    'loadstring', 'next', 'pairs', 'pcall', 'print', 'rawequal', 'rawget', 'rawlen', 'rawset', 'require', 'select',
    'setmetatable', 'tonumber', 'tostring', 'type', 'unpack', 'xpcall']);

// The classes that extend another; the wiki lists the methods of each class on its own page.
const CLASS_BASES = { Player: 'Entity', Weapon: 'Entity', NPC: 'Entity', Vehicle: 'Entity', NextBot: 'Entity', CSEnt: 'Entity' };

// The tables of hooks a gamemode or a scripted entity or weapon defines, and the classes they
// describe. The wiki keeps them apart from the classes of the objects themselves.
const HOOK_CONTAINERS = new Set(['GM', 'SANDBOX', 'ENTITY', 'WEAPON', 'PLAYER', 'TOOL', 'EFFECT', 'NEXTBOT', 'PANEL', 'DRIVE']);

const REALM_SIDES = {
    'server': 'server',
    'client': 'client',
    'shared': 'shared',
    'menu': 'client',
    'client and menu': 'client',
    'shared and menu': 'shared',
};

const wiki = JSON.parse(fs.readFileSync(API_PATH, 'utf8'));
const entries = wiki.entries;
const byType = type => entries.filter(entry => entry.type === type);

const GLOBALS = byType('libraryfunc').filter(entry => entry.parent === '_G');
const GLOBAL_NAMES = new Set(GLOBALS.map(entry => entry.name));
const CLASSES = new Map(byType('class').filter(entry => !HOOK_CONTAINERS.has(entry.name)).map(entry => [entry.name, entry]));
const PANELS = new Map(byType('panel').filter(entry => !CLASSES.has(entry.name) && !GLOBAL_NAMES.has(entry.name)).map(entry => [entry.name, entry]));
// The structures that describe the tables `ENT` and `SWEP`, whose fields go into the classes of
// those tables instead.
const SCRIPTED_STRUCTS = new Set(['ENT', 'SWEP']);

const STRUCTS = new Map(byType('struct')
    .filter(entry => !CLASSES.has(entry.name) && !PANELS.has(entry.name) && !HOOK_CONTAINERS.has(entry.name) && !SCRIPTED_STRUCTS.has(entry.name))
    .map(entry => [entry.name, entry]));

// The name a structure is declared under: its own, or with `Data` appended where a global
// function takes the name, such as `DynamicLight`.
function structName(name) {
    return GLOBAL_NAMES.has(name) ? `${name}Data` : name;
}
const LIBRARIES = byType('library').filter(entry => entry.name !== '_G');
const KNOWN_TYPES = new Set([...CLASSES.keys(), ...PANELS.keys(), ...STRUCTS.keys()]);

function membersOf(type, parent) {
    return entries.filter(entry => entry.type === type && entry.parent === parent);
}

function safeIdent(name) {
    let ident = String(name || '_').replace(/[^A-Za-z0-9_]/g, '_');
    if (/^[0-9]/.test(ident)) ident = '_' + ident;
    return NEBRA_KEYWORDS.has(ident) ? ident + '_' : ident;
}

function isIdentifier(name) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !NEBRA_KEYWORDS.has(name);
}

function fieldLabel(name) {
    return isIdentifier(name) ? name : JSON.stringify(name);
}

function grouped(type) {
    return /[|>]/.test(type) ? `(${type})` : type;
}

// Splits a wiki type on `|` outside angle and curly brackets.
function splitUnion(text) {
    const parts = [];
    let depth = 0;
    let current = '';
    for (const character of text) {
        if (character === '<' || character === '{') depth++;
        if (character === '>' || character === '}') depth--;
        if (character === '|' && depth === 0) {
            parts.push(current);
            current = '';
        } else {
            current += character;
        }
    }
    parts.push(current);
    return parts.map(part => part.trim()).filter(Boolean);
}

// The Nebra type of a type as the wiki writes it: `number`, `Entity`, `number{ACT}` (a number of
// an enum), `table{TraceResult}` (a structure), `table<Player>` (a list) or a union of them.
function mapType(raw) {
    const text = String(raw || 'any').trim();
    const alternatives = splitUnion(text);
    if (alternatives.length > 1) return [...new Set(alternatives.map(mapType))].join(' | ');

    const structure = text.match(/^table\{(.+)\}$/);
    if (structure) return STRUCTS.has(structure[1]) ? structName(structure[1]) : '{ [any]: any }';

    const generic = text.match(/^table<(.+)>$/);
    if (generic) {
        const parts = generic[1].split(',').map(part => part.trim());
        if (parts.length === 2) return `{ [${mapType(parts[0])}]: ${mapType(parts[1])} }`;
        return `${grouped(mapType(parts[0].replace(/^Structures\//, 'table{') + (parts[0].startsWith('Structures/') ? '}' : '')))}[]`;
    }

    const enumerated = text.match(/^(number|string)\{.+\}$/);
    if (enumerated) return enumerated[1];

    switch (text) {
        case 'number': case 'string': case 'boolean': case 'nil': case 'any': case 'thread': case 'userdata':
            return text;
        case 'function':
            return 'function';
        case 'table':
            return '{ [any]: any }';
        case 'vararg':
            return 'any';
        default:
            if (STRUCTS.has(text)) return structName(text);
            return KNOWN_TYPES.has(text) ? text : 'any';
    }
}

function optionalType(type) {
    return splitUnion(type).includes('nil') ? type : `${type} | nil`;
}

// The type of an argument, return value or field: a callback is typed by the arguments it is
// called with, and an alternative type the wiki gives is joined into a union.
function entryType(entry) {
    if (entry.callback) {
        const parameters = (entry.callback.arguments || []).map(argument => argument.type === 'vararg' ? '...any' : mapType(argument.type));
        const returns = entry.callback.returns || [];
        const result = returns.length === 0 ? 'any' : returns.length === 1 ? mapType(returns[0].type) : `(${returns.map(value => mapType(value.type)).join(', ')})`;
        return `(${parameters.join(', ')}) -> ${result}`;
    }
    const type = mapType(entry.type);
    return entry.altType ? [...new Set([...splitUnion(type), ...splitUnion(mapType(entry.altType))])].join(' | ') : type;
}

function parameterList(argumentsList) {
    return argumentsList.map((argument, index) => {
        if (argument.type === 'vararg' || argument.name === '...') return `...: any`;
        const type = entryType(argument);
        const name = safeIdent(argument.name || `arg${index + 1}`);
        return `${name}: ${'default' in argument ? optionalType(type) : type}`;
    }).join(', ');
}

function returnType(returns) {
    if (!returns || returns.length === 0) return 'nil';
    const types = returns.map(value => value.type === 'vararg' ? '...any' : entryType(value));
    return types.length === 1 ? types[0] : `(${types.join(', ')})`;
}

// The argument lists of a function, one per overload the wiki documents.
function argumentLists(fn) {
    const groups = fn.arguments || [];
    return groups.length === 0 ? [[]] : groups.map(group => group.args || []);
}

function cleanText(text) {
    return String(text || '')
        .replace(/\r/g, '')
        .replace(/\[([^\]]+)\]\(https:\/\/wiki\.facepunch\.com\/gmod\/[^)]*\)/g, '`$1`')
        .replace(/\t/g, ' ')
        .trim();
}

function docLines(indent, entry, argumentsList, returns) {
    const lines = [];
    for (const line of cleanText(entry.description).split('\n')) {
        if (line.trim()) lines.push(`${indent}--- ${line.trim()}`);
    }
    for (const argument of argumentsList || []) {
        const text = cleanText(argument.description).replace(/\s*\n\s*/g, ' ');
        if (text) lines.push(`${indent}--- @param ${argument.name === '...' ? '...' : safeIdent(argument.name)} ${text}`);
    }
    for (const value of returns || []) {
        const text = cleanText(value.description).replace(/\s*\n\s*/g, ' ');
        if (text) lines.push(`${indent}--- @return ${entryType(value)} ${text}`);
    }
    if (entry.deprecated) lines.push(`${indent}--- @deprecated ${cleanText(typeof entry.deprecated === 'string' ? entry.deprecated : '').replace(/\s*\n\s*/g, ' ')}`.trimEnd());
    return lines;
}

function sideLine(indent, realm) {
    const side = REALM_SIDES[realm];
    return side ? [`${indent}@side(${side})`] : [];
}

// The declarations of a function, one per overload whose parameter types differ from those
// before it.
function functionDeclarations(indent, fn, keyword, name = fn.name) {
    const out = [];
    const seen = new Set();
    for (const list of argumentLists(fn)) {
        const parameters = parameterList(list);
        const signature = parameters.replace(/[A-Za-z_][A-Za-z0-9_]*: /g, '');
        if (seen.has(signature)) continue;
        seen.add(signature);
        out.push(...docLines(indent, fn, list, fn.returns));
        out.push(...sideLine(indent, fn.realm));
        out.push(`${indent}${keyword} ${safeIdent(name)}(${parameters}): ${returnType(fn.returns)}`);
    }
    return out;
}

function typeDoc(entry) {
    return cleanText(entry.description).split('\n').filter(line => line.trim()).map(line => `--- ${line.trim()}`);
}

// A class of the game, such as Entity or Vector. A global function of the same name that
// returns it, such as `Vector(x, y, z)`, is its constructor: `new Vector(1, 2, 3)` compiles
// to that call.
function emitClass(name, base, methods, extraMembers = []) {
    const out = [];
    const entry = CLASSES.get(name) || PANELS.get(name);
    if (entry) out.push(...typeDoc(entry));

    const constructor = GLOBALS.find(fn => fn.name === name && (fn.returns || []).some(value => value.type === name));
    if (constructor) out.push('@overrideCtor("$class($args)")');
    out.push(`declare class ${name}${base ? ` extends ${base}` : ''}`);
    if (constructor) {
        for (const list of argumentLists(constructor)) {
            out.push(...docLines('    ', constructor, list, null));
            out.push(`    constructor(${parameterList(list)})`);
        }
    }
    out.push(...extraMembers);
    out.push(...structFields(name));

    const inherited = inheritedMethods(base);
    for (const method of methods) {
        out.push(...functionDeclarations('    ', method, inherited.has(method.name) ? 'override function' : 'function'));
    }
    out.push('end');
    return out.join('\n');
}

// The fields of the structure of the same name as a class, such as the `r`, `g`, `b` and `a`
// of `Color`, which the wiki documents apart from the class's methods.
function structFields(name) {
    const struct = entries.find(entry => entry.type === 'struct' && entry.name === name);
    const out = [];
    for (const field of (struct && struct.fields) || []) {
        if (!isIdentifier(field.name)) continue;
        const text = cleanText(field.description).replace(/\s*\n\s*/g, ' ');
        if (text) out.push(`    --- ${text}`);
        const type = entryType(field);
        out.push(`    ${field.name}: ${'default' in field ? optionalType(type) : type}`);
    }
    return out;
}

function classBase(name) {
    if (CLASS_BASES[name]) return CLASS_BASES[name];
    const panel = PANELS.get(name);
    if (!panel) return null;
    if (panel.parent && (PANELS.has(panel.parent) || panel.parent === 'Panel')) return panel.parent;
    return name === 'Panel' ? null : 'Panel';
}

function methodsOf(name) {
    return [...membersOf('classfunc', name), ...membersOf('panelfunc', name)];
}

function inheritedMethods(base) {
    const names = new Set();
    for (let current = base; current; current = classBase(current)) {
        for (const method of methodsOf(current)) names.add(method.name);
    }
    return names;
}

// Classes and panels in an order where every one comes after the one it extends.
function orderedClasses() {
    const ordered = [];
    const placed = new Set();
    const place = name => {
        if (placed.has(name)) return;
        const base = classBase(name);
        if (base) place(base);
        placed.add(name);
        ordered.push(name);
    };
    for (const name of [...CLASSES.keys(), ...PANELS.keys()]) place(name);
    return ordered;
}

function emitStruct(struct) {
    const out = [...typeDoc(struct)];
    out.push(`declare interface ${structName(struct.name)}`);
    for (const field of struct.fields || []) {
        const text = cleanText(field.description).replace(/\s*\n\s*/g, ' ');
        if (text) out.push(`    --- ${text}`);
        const type = entryType(field);
        out.push(`    ${fieldLabel(field.name)}: ${'default' in field ? optionalType(type) : type}`);
    }
    out.push('end');
    return out.join('\n');
}

// The enumerations are global constants in GMod, such as `WEAPON_PROFICIENCY_POOR`; those the
// wiki lists under a table, such as `TEXFILTER.NONE`, are fields of a global table.
function emitEnums() {
    const out = [];
    const tables = new Map();
    for (const enumeration of byType('enum')) {
        for (const item of enumeration.items || []) {
            const type = /^-?[0-9.]+$/.test(String(item.value)) ? 'number' : 'any';
            const [table, field] = item.key.includes('.') ? item.key.split('.') : [null, item.key];
            if (table) {
                if (!tables.has(table)) tables.set(table, []);
                tables.get(table).push(`    ${fieldLabel(field)}: ${type}`);
                continue;
            }
            if (!isIdentifier(item.key)) continue;
            const text = cleanText(item.description).replace(/\s*\n\s*/g, ' ');
            if (text) out.push(`--- ${text}`);
            out.push(`declare ${item.key}: ${type}`);
        }
    }
    for (const [table, fields] of tables) {
        out.push(`declare interface ${table}Enum`);
        out.push(...fields);
        out.push('end');
        out.push(`declare ${table}: ${table}Enum`);
    }
    return out.join('\n');
}

function hookType(hook) {
    const list = argumentLists(hook)[0];
    const parameters = list.map(argument => argument.type === 'vararg' ? '...any' : entryType(argument));
    const returns = hook.returns || [];
    const result = returns.length === 0 ? 'any' : optionalType(entryType(returns[0]));
    return `(${parameters.join(', ')}) -> ${result}`;
}

function hookFields(parents) {
    const out = [];
    const seen = new Set();
    for (const parent of parents) {
        for (const hook of membersOf('hook', parent)) {
            if (seen.has(hook.name)) continue;
            seen.add(hook.name);
            out.push(...docLines('    ', hook, argumentLists(hook)[0], hook.returns));
            out.push(...sideLine('    ', hook.realm));
            out.push(`    ${fieldLabel(hook.name)}: (${hookType(hook)})?`);
        }
    }
    return out;
}

// The gamemode hooks: `GMHooks` types what `hook.Add` registers for each event, and the
// `GM` and `GAMEMODE` tables a gamemode fills with `function GM:PlayerSpawn(ply)`.
function emitGamemode() {
    const out = [];
    out.push('--- The hooks of the gamemode, by event name, as `hook.Add` registers them.');
    out.push('declare interface GMHooks');
    out.push(...hookFields(['GM', 'SANDBOX']));
    out.push('end');
    out.push('');
    out.push('--- A gamemode table: its settings and the hooks it implements.');
    out.push('declare interface Gamemode extends GMHooks');
    out.push(...structFields('GM').filter(line => !/^\s+BaseClass:/.test(line)));
    out.push('    --- The gamemode this one derives from.');
    out.push('    BaseClass: Gamemode');
    out.push('end');
    out.push('');
    out.push('declare GM: Gamemode');
    out.push('declare GAMEMODE: Gamemode');
    return out.join('\n');
}

// The tables a scripted entity or weapon file fills, `ENT` and `SWEP`: an entity of their
// class with the hooks the engine calls on it.
function emitScripted(name, base, hookParent, struct) {
    const extra = [];
    const structEntry = entries.find(entry => entry.type === 'struct' && entry.name === struct);
    for (const field of (structEntry && structEntry.fields) || []) {
        if (!isIdentifier(field.name)) continue;
        extra.push(`    ${field.name}: ${optionalType(entryType(field))}`);
    }
    const inherited = new Set([...inheritedMethods(base), ...extra.map(line => line.trim().split(':')[0])]);
    for (const hook of membersOf('hook', hookParent)) {
        if (inherited.has(hook.name) || !isIdentifier(hook.name)) continue;
        inherited.add(hook.name);
        extra.push(...docLines('    ', hook, argumentLists(hook)[0], hook.returns));
        extra.push(`    ${hook.name}: (${hookType(hook)})?`);
    }
    return [`declare class ${name} extends ${base}`, ...extra, 'end'].join('\n');
}

// A library such as `net` or `hook`. One the standard library declares adds the members it
// does not have to the standard library's interface.
function emitLibrary(library) {
    const stdlib = STDLIB[library.name];
    const ifaceName = stdlib ? stdlib.iface : `${library.name.charAt(0).toUpperCase()}${library.name.slice(1)}Lib`;
    const skip = new Set(stdlib ? stdlib.members : []);
    const out = [...typeDoc(library)];
    out.push(`declare interface ${ifaceName}`);
    for (const fn of membersOf('libraryfunc', library.name)) {
        if (skip.has(fn.name)) continue;
        if (library.name === 'hook') out.push(...typedHookFunction(fn.name));
        if (library.name === 'vgui' && fn.name === 'Create') out.push(...typedPanelCreate());
        out.push(...functionDeclarations('    ', fn, 'function'));
    }
    out.push('end');
    if (!stdlib) out.push(`declare ${safeIdent(library.name)}: ${ifaceName}`);
    return out.join('\n');
}

// The overloads of `hook.Add` and friends for the gamemode's own events, whose callback is
// typed by the event it names; the wiki's overload taking any name stays for custom events. It
// comes first, so a name both fit picks it.
function typedHookFunction(name) {
    switch (name) {
        case 'Add':
            return ['    --- Adds a hook to a gamemode event, typed by the event it names.',
                '    function Add<K extends keyof GMHooks>(eventName: K, identifier: any, func: GMHooks[K]): nil'];
        case 'Remove':
            return ['    function Remove<K extends keyof GMHooks>(eventName: K, identifier: any): nil'];
        default:
            return [];
    }
}

// The overload of `vgui.Create` returning the class of the panel it names.
function typedPanelCreate() {
    return ['    --- Creates a panel of the class it names, typed as that class.',
        '    @side(client)',
        '    function Create<K extends keyof PanelClasses>(classname: K, parent: Panel | nil, name: string | nil): PanelClasses[K]'];
}

function emitPanelClasses() {
    const out = ['--- The panel classes `vgui.Create` creates, by class name.', 'declare interface PanelClasses'];
    for (const name of PANELS.keys()) out.push(`    ${fieldLabel(name)}: ${name}`);
    out.push('end');
    return out.join('\n');
}

function emitGlobals() {
    const out = [];
    for (const fn of GLOBALS) {
        if (STDLIB_GLOBALS.has(fn.name) || CLASSES.has(fn.name) || PANELS.has(fn.name)) continue;
        out.push(...functionDeclarations('', fn, 'declare function'));
    }
    out.push('--- Whether the code runs on the client.');
    out.push('declare CLIENT: boolean');
    out.push('--- Whether the code runs on the server.');
    out.push('declare SERVER: boolean');
    out.push('--- Whether the code runs in the main menu state.');
    out.push('declare MENU_DLL: boolean');
    return out.join('\n');
}

function main() {
    const parts = [];
    parts.push(`-- Generated from the Garry's Mod wiki as of ${wiki.lastUpdate || 'unknown'}.`);
    parts.push('-- Source: api/wiki.json (glua-api-snippets), generator: generate/generate.js.');
    parts.push('-- Do not edit by hand. Refresh the wiki data with merge-api.js and run generate.js.');
    parts.push('');

    for (const struct of STRUCTS.values()) {
        parts.push(emitStruct(struct));
        parts.push('');
    }
    for (const name of orderedClasses()) {
        parts.push(emitClass(name, classBase(name), methodsOf(name)));
        parts.push('');
    }
    parts.push(emitScripted('ScriptedEntity', 'Entity', 'ENTITY', 'ENT'));
    parts.push('declare ENT: ScriptedEntity');
    parts.push('');
    parts.push(emitScripted('ScriptedWeapon', 'Weapon', 'WEAPON', 'SWEP'));
    parts.push('declare SWEP: ScriptedWeapon');
    parts.push('');
    parts.push(emitGamemode());
    parts.push('');
    parts.push(emitPanelClasses());
    parts.push('');
    for (const library of LIBRARIES) {
        parts.push(emitLibrary(library));
        parts.push('');
    }
    parts.push(emitGlobals());
    parts.push('');
    parts.push(emitEnums());
    parts.push('');

    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, parts.join('\n'));
    console.log(`Generated ${path.relative(ROOT, OUT_PATH)} (${(fs.statSync(OUT_PATH).size / 1024).toFixed(1)} KiB, ${CLASSES.size} classes, ${PANELS.size} panels, ${STRUCTS.size} structures, ${LIBRARIES.length} libraries)`);
}

main();
