class Restricted
  @value : Int32

  def initialize(@value)
  end

  def conditional(value)
    if ARGC_UNSAFE > 0
      @value = value
    end
  end

  def reassigned(value)
    value = 9
    @value = value
  end

  def value
    @value
  end
end

item = Restricted.new(3)
item.conditional(4)
item.reassigned(5)
puts item.value
