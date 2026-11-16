# Each call selects a different Def; compare this with example 03.
def identity(x : Int32)
  x
end

def identity(x : Float64)
  x
end

identity(1)
identity(1.0)
