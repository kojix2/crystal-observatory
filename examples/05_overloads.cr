# 同じ名前でも引数型が違えば別のDefが選ばれる。
def scale(x : Int32)
  x * 2
end

def scale(x : Float64)
  x * 0.5
end

a = scale(21)
b = scale(3.0)
{a, b}
