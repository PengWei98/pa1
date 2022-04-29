import { classicNameResolver } from "typescript";
import { Stmt, Expr, BinOp, Type, UniOp, ClassDef } from "./ast";
import { parse } from "./parser";
import { typeCheckProgram} from "./typecheck"

// https://learnxinyminutes.com/docs/wasm/

type LocalEnv = Map<string, boolean>;

type CompileResult = {
  wasmSource: string,
  wasmFuncs: string
};

export function compile(source: string) : CompileResult {
  const ast = typeCheckProgram(parse(source));
  const definedVars = new Set();
  ast.vardefs.forEach(s => {
    definedVars.add(s.typedvar.name);
  }); 
  const scratchVar : string = `(local $$last i32)`;
  const localDefines = [scratchVar];
  definedVars.forEach(v => {
    localDefines.push(`(local $${v} i32)`);
  });

  const funcDefines: string[] = [];
  ast.funcdefs.forEach((func) => {
    const params = func.params.map((param) =>{
      return `(param $${param.name} i32)`
    });
    var signature = `(func $${func.name} ${params.join(" ")} (result i32) (local $$last i32)\n`;
    const funcVars: string[] = [];
    func.vardefs.forEach(v => {
      funcVars.push(`(local $${v.typedvar.name} i32)`);
    });
    signature = signature + funcVars.join("\n")

    const funcStmts = func.stmts.map((stmt) => {
      // console.log(stmt);
      // console.log( codeGen(stmt, ast.classdefs))
      return codeGen(stmt, ast.classdefs).join("\n")});
      var funcAllStmts;
      if (func.ret === "none"){
        funcAllStmts = signature + "\n" + funcStmts.join("\n") + "(i32.const 0)\n)";
      }
      else{
        funcAllStmts = signature + "\n" + funcStmts.join("\n") + ")";
      }
    // console.log(funcAllStmts)
    funcDefines.push(funcAllStmts);
  });

  ast.classdefs.forEach((classdef) => {
    classdef.methoddefs.forEach((methoddef) => {
      const params = methoddef.params.map((param) =>{
        return `(param $${param.name} i32)`
      });

      var signature = `(func $${methoddef.name} ${params.join(" ")} (result i32) (local $$last i32)\n`;
      const funcVars: string[] = [];
      methoddef.vardefs.forEach(v => {
        funcVars.push(`(local $${v.typedvar.name} i32)`);
      });
      signature = signature + funcVars.join("\n")
  
      const funcStmts = methoddef.stmts.map((stmt) => {
        return codeGen(stmt, ast.classdefs).join("\n")});
      var funcAllStmts;
      if (methoddef.ret === "none"){
        funcAllStmts = signature + "\n" + funcStmts.join("\n") + "(i32.const 0)\n)";
      }
      else{
        funcAllStmts = signature + "\n" + funcStmts.join("\n") + ")";
      }

      funcDefines.push(funcAllStmts);
    })
  })

  var wasmFuncs = funcDefines.join("\n\n");

  
  const commandGroups = ast.stmts.map((stmt) => codeGen(stmt, ast.classdefs));
  console.log("commandGroups")
  console.log(commandGroups)
  // const commands = localDefines.concat(funcDefines).concat([].concat.apply([], commandGroups));
  const commands = localDefines.concat([].concat.apply([], commandGroups));
  console.log(commands)
  console.log("Generated: ", commands.join("\n"));
  return {
    wasmSource: commands.join("\n"),
    wasmFuncs
  };
}

function codeGen(stmt: Stmt<Type>, classdefs: ClassDef<Type>[]) : Array<string> {
  switch(stmt.tag) {
    case "assign":
      var valStmts = codeGenExpr(stmt.value, classdefs);
      return valStmts.concat([`(local.set $${stmt.name})`]);
    case "memberAssign":
      console.log("stmtmtmt")
      console.log(stmt)
      const objStmts = codeGenExpr((stmt.member as any).objName, classdefs);
      var valStmts = codeGenExpr(stmt.value, classdefs);

      const className: string = ((stmt.member as any).objName.a?.valueOf() as any).class;
      const classData = classdefs.filter((classdef) => classdef.name === className)[0];
      var index = 0;
      for(; index < classData.vardefs.length; index++){
        if (classData.vardefs[index].typedvar.name === (stmt.member as any).varName){
          break;
        }
      }
      return [
        ...objStmts, 
        `(i32.add (i32.const ${index * 4}))`,
        ...valStmts,
        `i32.store`
      ];
    case "expr":
      var exprStmts = codeGenExpr(stmt.expr, classdefs);
      // return exprStmts.concat([`(local.set $$last)`]);
      return exprStmts.concat("(drop)");
    case "return":
      var valStmts = codeGenExpr(stmt.ret, classdefs);
      return valStmts;
    case "assign":
      var valStmts = codeGenExpr(stmt.value, classdefs);
      valStmts.push(`(local.set $${stmt.name})`);
      return valStmts;
    case "if":
      var condExpr = codeGenExpr(stmt.cond, classdefs);
      var out = condExpr.concat([`(if`]).concat([`(then`]).concat(codeGenStmts(stmt.ifStmts, classdefs)).concat([`)`]);
      out = out.concat([`(else`]).concat(codeGenStmts(stmt.elseStmts, classdefs)).concat([`)`]).concat([`)`])
      return out;
    case "while":
      var whileCond = codeGenExpr(stmt.cond, classdefs);

      const loop = `(loop`.concat(stmt.stmts.map(st => codeGen(st, classdefs).join("\n")).join('\n')).concat(`${whileCond.join("\n")}`).concat(`br_if 0`).concat(`)`)
      
      var out = whileCond.concat([`(if`]).concat([`(then`]).concat(loop).concat([`)`]);
      out = out.concat([`(else`]).concat(codeGenStmts([], classdefs)).concat([`)`]).concat([`)`]);
      return out;
  }
}

// export function codeGenClass(classDef: ClassDef<Type>): Array<string> {

// }

export function codeGenStmts(stmts: Stmt<Type>[], classdefs: ClassDef<Type>[]): Array<string> {
  var stmtsCode: string[] = [];
  stmts.forEach(stmt => {
    const stmtCode = codeGen(stmt, classdefs);
    stmtsCode = stmtsCode.concat(stmtCode);
  });
  return stmtsCode;
}

function codeGenExpr(expr : Expr<Type>, classdefs: ClassDef<Type>[] ) : Array<string> {
  switch(expr.tag) {
    case "builtin1":
      const argStmts = codeGenExpr(expr.arg, classdefs);
      return argStmts.concat([`(call $${expr.name})`]);
    case "builtin2":
      const argStmts0 = codeGenExpr(expr.arg0, classdefs);
      const argStmts1 = codeGenExpr(expr.arg1, classdefs);
      return [...argStmts0, ...argStmts1, `(call $${expr.name})`];
    case "literal":
      if (expr.literal.tag === "num"){
        return ["(i32.const " + expr.literal.value + ")"];
      }
      else if (expr.literal.tag === "bool"){
        const boolVal = expr.literal.value ? 1 : 0;
        return ["(i32.const " + boolVal + ")"];
      }
      else {
        return ["(i32.const 0)"];
      }
    case "id":
      return [`(local.get $${expr.name})`];
    case "binOp":
      const left = codeGenExpr(expr.left, classdefs);
      const right = codeGenExpr(expr.right, classdefs);
      var op: string;
      switch(expr.op){
        case BinOp.Plus:
          op = "(i32.add)";
          break;
        case BinOp.Minus:
          op = "(i32.sub)";
          break;
        case BinOp.Mul:
          op = "(i32.mul)";
          break;
        case BinOp.Div:
          op = "(i32.div_s)";
          break;
        case BinOp.Mod:
          op = "(i32.rem_s)";
          break;
        case BinOp.Eq:
          op = "(i32.eq)";
          break;
        case BinOp.NE:
          op = "(i32.ne)";
          break;
        case BinOp.LT:
          op = "(i32.lt_s)";
          break;
        case BinOp.GT:
          op = "(i32.gt_s)";
          break;
        case BinOp.LTE:
          op = "(i32.le_s)";
          break;
        case BinOp.GTE:
          op = "(i32.ge_s)";
          break;
        case BinOp.Is:
          if (expr.left.a === "none" as Type && expr.right.a === "none" as Type){
            return ["(i32.const 1)"];
          } else if (expr.left.a === expr.right.a){
            return [...left, ...right, "(i32.eq)"]; 
          } else{
            return ["(i32.const 0)"];
          }
        default:
          throw new Error("Invalid Op");
      }
      return [...left, ...right, op];
    case "UniOp":
      const arg = codeGenExpr(expr.arg, classdefs);
      var op: string;
      switch(expr.op){
        case UniOp.Not:
          op = "(i32.eqz)"
          return [...arg, op];
        case UniOp.UMinus:
          op = "(i32.sub)";
          return ["(i32.const 0)", ...arg, op];
      }
    case "call":
      if (expr.isFunc){
        // call a function
        const args = expr.args.map((arg) => codeGenExpr(arg, classdefs)).join(" ");
        return [args, "call", "$" + expr.name];
      } else {
        // initailize a object
        var initvals: any[] = [];
        const className = expr.name;
        const classData = classdefs.filter((classdef) => classdef.name === className)[0];
        classData.vardefs.forEach((f, index) => {
          const offset = index * 4;
          var literalExpr;
          if (f.literal.tag === "num"){
            literalExpr = ["(i32.const " + f.literal.value + ")"];
          }
          else if (f.literal.tag === "bool"){
            const boolVal = f.literal.value ? 1 : 0;
            literalExpr = ["(i32.const " + boolVal + ")"];
          }
          else {
            literalExpr = ["(i32.const 0)"];
          }

          initvals = [
            ...initvals,
            `(global.get $heap)`,
            `(i32.add (i32.const ${offset}))`,
            ...literalExpr,
            `i32.store`];
        });
        return [
          ...initvals,
          `(global.get $heap)`, // the return value (the start address)
          `(global.set $heap (i32.add (global.get $heap) (i32.const ${classData.vardefs.length * 4})))`
        ]

      }
    case "classVar":
      const objStmts = codeGenExpr(expr.objName, classdefs);
      console.log("exprrr")
      console.log(expr);
      const className: string = (expr.objName.a?.valueOf() as any).class;
      const classData = classdefs.filter((classdef) => classdef.name === className)[0];
      var index = 0;
      for(; index < classData.vardefs.length; index++){
        if (classData.vardefs[index].typedvar.name === expr.varName){
          break;
        }
      }
      return [
        ...objStmts, 
        `(i32.add (i32.const ${index * 4}))`,
        `i32.load`
      ]
    case "classMethod":
      var args: any[] = [];
      [expr.objName, ...expr.args].forEach((arg) => {
        args = [
          ...args,
          ...codeGenExpr(arg, classdefs)
        ];
      })
      return [...args, "call", "$" + expr.methodName];

  }
}


