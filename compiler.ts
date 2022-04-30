import { classicNameResolver } from "typescript";
import { Stmt, Expr, BinOp, Type, UniOp, ClassDef, Literal, VarDef } from "./ast";
import { parse } from "./parser";
import { typeCheckProgram} from "./typecheck"

// https://learnxinyminutes.com/docs/wasm/

type LocalEnv = Map<string, boolean>;

type CompileResult = {
  wasmSource: string,
  wasmFuncs: string,
  wasmGlobals: string
};


export function compile(source: string) : CompileResult {
  const ast = typeCheckProgram(parse(source));
  console.log('ast')
  console.log(ast)
  const definedVars = new Set();
  const globalDefines: string[] = [];
  ast.vardefs.forEach(s => {
    definedVars.add(s.typedvar.name);
    var literalExpr;
    if (s.literal.tag === "num"){
      literalExpr = "(i32.const " + s.literal.value + ")";
    }
    else if (s.literal.tag === "bool"){
      const boolVal = s.literal.value ? 1 : 0;
      literalExpr = "(i32.const " + boolVal + ")";
    }
    else {
      literalExpr = "(i32.const 0)";
    }
    globalDefines.push(`(global $${s.typedvar.name} (mut i32) ${literalExpr})`);
  }); 
  const wasmGlobals = globalDefines.join("\n")

  const scratchVar : string = `(local $$last i32)`;
  const localDefines = [scratchVar];
  // definedVars.forEach(v => {
  //   localDefines.push(`(local $${v} i32)`);
  // });



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
      // console.log( codeGen(stmt, ast.classdefs))
      return codeGen(stmt, ast.classdefs, ast.vardefs).join("\n")});
    var funcAllStmts;
    funcAllStmts = signature + "\n" + funcStmts.join("\n") + "(i32.const 0)\n)";
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
        return codeGen(stmt, ast.classdefs, ast.vardefs).join("\n")});
      var funcAllStmts;
      // if (methoddef.ret === "none"){
        funcAllStmts = signature + "\n" + funcStmts.join("\n") + "(i32.const 0)\n)";
      // }
      // else{
      //   funcAllStmts = signature + "\n" + funcStmts.join("\n") + ")";
      // }

      funcDefines.push(funcAllStmts);
    })
  })

  var wasmFuncs = funcDefines.join("\n\n");
  
  const commandGroups = ast.stmts.map((stmt) => codeGen(stmt, ast.classdefs, ast.vardefs));

  const commands = localDefines.concat([].concat.apply([], commandGroups));
  return {
    wasmSource: commands.join("\n"),
    wasmFuncs,
    wasmGlobals
  };
}

function codeGen(stmt: Stmt<Type>, classdefs: ClassDef<Type>[], globaldefs: VarDef<Type>[]) : Array<string> {
  console.log(stmt.tag)
  switch(stmt.tag) {
    case "assign":
      var valStmts = codeGenExpr(stmt.value, classdefs, globaldefs);
      if (globaldefs.map((globaldef)  => globaldef.typedvar.name).includes(stmt.name)){
        return valStmts.concat([`(global.set $${stmt.name})`]);
      } else{
        return valStmts.concat([`(local.set $${stmt.name})`]);
      }
    case "memberAssign":
      const objStmts = codeGenExpr((stmt.member as any).objName, classdefs, globaldefs);
      var valStmts = codeGenExpr(stmt.value, classdefs, globaldefs);

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
      var exprStmts = codeGenExpr(stmt.expr, classdefs, globaldefs);
      return exprStmts.concat([`(local.set $$last)`]);
      // return exprStmts.concat("(drop)");
    case "return":

      var valStmts = codeGenExpr(stmt.ret, classdefs, globaldefs);
      valStmts.push("return");
      return valStmts;
    case "assign":
      var valStmts = codeGenExpr(stmt.value, classdefs, globaldefs);
      valStmts.push(`(local.set $${stmt.name})`);
      return valStmts;
    case "if":
      var condExpr = codeGenExpr(stmt.cond, classdefs, globaldefs);
      var out = condExpr.concat([`(if`]).concat([`(then`]).concat(codeGenStmts(stmt.ifStmts, classdefs, globaldefs)).concat([`)`]);
      out = out.concat([`(else`]).concat(codeGenStmts(stmt.elseStmts, classdefs, globaldefs)).concat([`)`]).concat([`)`])
      return out;

    case "while":
      var whileCond = codeGenExpr(stmt.cond, classdefs, globaldefs);

      const loop = `(loop`.concat(stmt.stmts.map(st => codeGen(st, classdefs, globaldefs).join("\n")).join('\n')).concat(`${whileCond.join("\n")}`).concat(`br_if 0`).concat(`)`)
      
      var out = whileCond.concat([`(if`]).concat([`(then`]).concat(loop).concat([`)`]);
      out = out.concat([`(else`]).concat(codeGenStmts([], classdefs, globaldefs)).concat([`)`]).concat([`)`]);
      return out;
  }
}

// export function codeGenClass(classDef: ClassDef<Type>): Array<string> {

// }

export function codeGenStmts(stmts: Stmt<Type>[], classdefs: ClassDef<Type>[], globaldefs: VarDef<Type>[]): Array<string> {
  var stmtsCode: string[] = [];
  stmts.forEach(stmt => {
    const stmtCode = codeGen(stmt, classdefs, globaldefs);
    stmtsCode = stmtsCode.concat(stmtCode);
  });
  return stmtsCode;
}

function codeGenExpr(expr : Expr<Type>, classdefs: ClassDef<Type>[], globaldefs: VarDef<Type>[]) : Array<string> {
  switch(expr.tag) {
    case "builtin1":
      const argStmts = codeGenExpr(expr.arg, classdefs, globaldefs);
      return argStmts.concat([`(call $${expr.name})`]);
    case "builtin2":
      const argStmts0 = codeGenExpr(expr.arg0, classdefs, globaldefs);
      const argStmts1 = codeGenExpr(expr.arg1, classdefs, globaldefs);
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
      if (globaldefs.map((globaldef)  => globaldef.typedvar.name).includes(expr.name)){
        return [`(global.get $${expr.name})`];
      }
      else {
        return [`(local.get $${expr.name})`];
      }
    case "binOp":
      const left = codeGenExpr(expr.left, classdefs, globaldefs);
      const right = codeGenExpr(expr.right, classdefs, globaldefs);
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
          } else if (expr.left.a === expr.right.a && ["int" as Type, "bool" as Type].includes(expr.left.a)){
            return [...left, ...right, "(i32.eq)"]; 
          } else if ((expr.left.a as any).tag === "object" && (expr.right.a as any).tag === "object" && (expr.left.a as any).class === (expr.right.a as any).class){
            return [...left, ...right, "(i32.eq)"]; 
          } else{
            return ["(i32.const 0)"];
          }
        default:
          throw new Error("Invalid Op");
      }
      return [...left, ...right, op];
    case "UniOp":
      const arg = codeGenExpr(expr.arg, classdefs, globaldefs);
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
        // const args = expr.args.map((arg) => codeGenExpr(arg, classdefs, globaldefs)).join(" ");
        var args: any[] = [];
        expr.args.forEach((arg) => {
          args = [
            ...args,
            ...codeGenExpr(arg, classdefs, globaldefs)
          ];
        })
        return [...args, "call", "$" + expr.name];
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
      const objStmts = codeGenExpr(expr.objName, classdefs, globaldefs);
      var className: string = (expr.objName.a?.valueOf() as any).class;
      const classData = classdefs.filter((classdef) => classdef.name === className)[0];
      var index = 0;
      for(; index < classData.vardefs.length; index++){
        if (classData.vardefs[index].typedvar.name === expr.varName){
          break;
        }
      }
      return [
        ...objStmts, 
        // `(call $check_null_pointer)`,
        `(i32.add (i32.const ${index * 4}))`,
        `i32.load`
      ]
    case "classMethod":
      var args: any[] = [];
      [expr.objName, ...expr.args].forEach((arg) => {
        args = [
          // args[0],
          // ...args.slice(1, args.length),
          ...args,
          ...codeGenExpr(arg, classdefs, globaldefs)
        ];
      })
      // args.splice(1, 0, `(call $check_null_pointer)`);


      // var className: string = (expr.objName.a?.valueOf() as any).class;
      // const mName = expr.methodName.includes("$") ? expr.methodName : className + "$" + expr.methodName;
      const mName = expr.methodName;
      return [...args, "call", "$" + mName];

  }
}


