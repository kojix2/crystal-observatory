# +=、unless、until の構文がどう変換されるか。
x = 1
x += 2
unless x > 10
  x = x + 4
end
until x >= 12
  x += 1
end
x
