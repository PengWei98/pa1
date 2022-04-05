1.Give three examples of Python programs that use binary operators and/or builtins from this PA, but have different behavior than your compiler. For each, write:
a sentence about why that is
a sentence about what you might do to extend the compiler to support it

e.g.1 :print("hello")
This is becasue we don't parse the string type when calling 'print' function. If we need to support it, we should parse the string type.

e.g.2 :pow(2, 1-3)
This is because the return type of 'pow' that we set is i32. So in our compiler,the result value is 0. If we need to support it, we should change the return value.

e.g.2 :min(0.1, 0.2)
This is because the arguement type i32 in our compiler, so float is not supported. If we need to support it, we should change the type of the arguement and return value.

2.What resources did you find most helpful in completing the assignment?
I think TA's video is the most helpful.

3.Who (if anyone) in the class did you work with on the assignment? (See collaboration below)
No collaboration.