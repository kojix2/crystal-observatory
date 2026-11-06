LIMIT = 3

class Counters
  @@seed = 1
  @@seed = 7
  @@derived : Int32 = @@seed + 1
  @wide : Int64 = 2

  def value
    @@seed + @@derived + @wide + LIMIT
  end
end

class Deferred(T)
  @value = 1
end

puts Counters.new.value
