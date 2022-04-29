import { importObject } from "./import-object.test";
import wabt from 'wabt';
import * as compiler from './../compiler';
import {parse} from './../parser';

// Modify typeCheck to return a `Type` as we have specified below
export function typeCheck(source: string) : Type {
  return "none";
}

// Modify run to use `importObject` (imported above) to use for printing
// You can modify `importObject` to have any new fields you need here, or
// within another function in your compiler, for example if you need other
// JavaScript-side helpers
export async function run(source: string): Promise<number> {
  // return;
  const wabtInterface = await wabt();
  const parsed = parse(source);
  var returnType = "";
  var returnExpr = "";
  const lastExpr = parsed.stmts[parsed.stmts.length - 1]
  if(lastExpr.tag === "expr") {
    returnType = "(result i32)";
    returnExpr = "(local.get $$last)"
  }
  const compiled = compiler.compile(source);
  const wasmSource = `(module
    (memory $js.mem (;0;) (import "js" "mem") 1)
    (func $print_num (import "imports" "print_num") (param i32) (result i32))
    (func $print_bool (import "imports" "print_bool") (param i32) (result i32))
    (func $print_none (import "imports" "print_none") (param i32) (result i32))
    (func $abs (import "imports" "abs") (param i32) (result i32))
    (func $max (import "imports" "max") (param i32 i32) (result i32))
    (func $min (import "imports" "min") (param i32 i32) (result i32))
    (func $pow (import "imports" "pow") (param i32 i32) (result i32))

    ${compiled.wasmFuncs}
    ${compiled.wasmGlobals}
    
    (global $heap (mut i32) (i32.const 4))

    (func (export "exported_func") ${returnType}
      ${compiled.wasmSource}
      ${returnExpr}
    )
  )`;
  console.log(wasmSource);
  const myModule = wabtInterface.parseWat("test.wat", wasmSource);
  var asBinary = myModule.toBinary({});
  var memory = new WebAssembly.Memory({initial:10, maximum:100});
  var wasmModule = await WebAssembly.instantiate(asBinary.buffer, { ...importObject, js: {mem: memory}} as any);
  // var wasmModule = await WebAssembly.instantiate(asBinary.buffer, importObject as any);
  const result = (wasmModule.instance.exports.exported_func as any)();
  return result;
}

type Type =
  | "int"
  | "bool"
  | "none"
  | { tag: "object", class: string }

export const NUM : Type = "int";
export const BOOL : Type = "bool";
export const NONE : Type = "none";
export function CLASS(name : string) : Type { 
  return { tag: "object", class: name }
};
