import { Stmt, Expr, BinOp, Type, UniOp } from "./ast";
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
  })

  const funcDefines: string[] = [];
  ast.funcdefs.forEach((func) => {
    const params = func.params.map((param) =>{
      return `(param $${param.name} i32)`
    });
    const signature = `(func $${func.name} ${params.join(" ")} (result i32) (local $$last i32)\n`;
    const funcStmts = func.stmts.map((stmt) => {
      console.log(stmt);
      console.log( codeGen(stmt))
      return codeGen(stmt).join("\n")});
    const funcAllStmts = signature + "\n" + funcStmts.join("\n") + ")";
    console.log(funcAllStmts)
    funcDefines.push(funcAllStmts);
  });

  var wasmFuncs = funcDefines.join("\n\n");

  
  const commandGroups = ast.stmts.map((stmt) => codeGen(stmt));
  // const commands = localDefines.concat(funcDefines).concat([].concat.apply([], commandGroups));
  const commands = localDefines.concat([].concat.apply([], commandGroups));
  console.log("Generated: ", commands.join("\n"));
  return {
    wasmSource: commands.join("\n"),
    wasmFuncs
  };
}

function codeGen(stmt: Stmt<Type>) : Array<string> {
  switch(stmt.tag) {
    case "assign":
      var valStmts = codeGenExpr(stmt.value);
      return valStmts.concat([`(local.set $${stmt.name})`]);
    case "expr":
      var exprStmts = codeGenExpr(stmt.expr);
      return exprStmts.concat([`(local.set $$last)`]);
    case "return":
      var valStmts = codeGenExpr(stmt.ret);
      return valStmts;
    case "assign":
      var valStmts = codeGenExpr(stmt.value);
      valStmts.push(`(local.set $${stmt.name})`);
      return valStmts;
    case "if":
      var condExpr = codeGenExpr(stmt.cond);
      var out = condExpr.concat([`(if`]).concat([`(then`]).concat(codeGenStmts(stmt.ifStmts)).concat([`)`]);
      out = out.concat([`(else`]).concat(codeGenStmts(stmt.elseStmts)).concat([`)`]).concat([`)`])
      return out;
    case "while":
      var whileCond = codeGenExpr(stmt.cond);

      const loop = `(loop`.concat(stmt.stmts.map(st => codeGen(st).join("\n")).join('\n')).concat(`${whileCond.join("\n")}`).concat(`br_if 0`).concat(`)`)
      
      var out = whileCond.concat([`(if`]).concat([`(then`]).concat(loop).concat([`)`]);
      out = out.concat([`(else`]).concat(codeGenStmts([])).concat([`)`]).concat([`)`]);
      return out;
  }
}

export function codeGenStmts(stmts: Stmt<Type>[]): Array<string> {
  var stmtsCode: string[] = [];
  stmts.forEach(stmt => {
    const stmtCode = codeGen(stmt);
    stmtsCode = stmtsCode.concat(stmtCode);
  });
  return stmtsCode;
}

function codeGenExpr(expr : Expr<Type>) : Array<string> {
  switch(expr.tag) {
    case "builtin1":
      const argStmts = codeGenExpr(expr.arg);
      return argStmts.concat([`(call $${expr.name})`]);
    case "builtin2":
      const argStmts0 = codeGenExpr(expr.arg0);
      const argStmts1 = codeGenExpr(expr.arg1);
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
      const left = codeGenExpr(expr.left);
      const right = codeGenExpr(expr.right);
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
          if (expr.left.a === Type.none && expr.right.a === Type.none){
            return ["(i32.const 1)"];
          } else if (expr.left.a === expr.right.a){
            return [...left, ...right, "(i32.eq)"]; 
          } else{
            return ["(i32.const 0)"];
          }
          break;
        default:
          throw new Error("Invalid Op");
      }
      return [...left, ...right, op];
    case "UniOp":
      const arg = codeGenExpr(expr.arg);
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
      const args = expr.args.map((arg) => codeGenExpr(arg)).join(" ");
      return [args, "call", "$" + expr.name];
  }
}
