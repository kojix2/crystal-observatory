# Compare +=, unless and until with their normalized AST.
x = 0
x += 1
unless x == 2
  x += 1
end
until x == 3
  x += 1
end
