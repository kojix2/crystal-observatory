def ignore(&block)
  7
end

def stop(status : Int32)
  exit(status)
end

def early_return
  return 5
  99
end

pointer = ->stop(Int32)
puts ignore { 1 }
puts typeof(pointer)
puts early_return

fun observatory_identity(value : Int32) : Int32
  value
end
