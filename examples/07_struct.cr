# Follow initialize, the generated new method and the instance variable's type.
struct Point
  def initialize(@x : Int32)
  end

  def x
    @x
  end
end

Point.new(1).x
