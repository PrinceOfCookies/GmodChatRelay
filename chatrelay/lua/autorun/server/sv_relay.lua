util.AddNetworkString("chatRelay")
local lastMessageTime = 0
function wsRelay:onMessage(message)
    message = util.JSONToTable(message)
    local type = message.type
    local payload = message.payload
    if type == "newMessage2" and payload then
        local text, number, color, name = payload.text, payload.number, payload.color, payload.name
        local colorParts = color and string.Explode(",", color) or {"255", "255", "255"}
        local r, g, b = tonumber(colorParts[1]) or 255, tonumber(colorParts[2]) or 255, tonumber(colorParts[3]) or 255
        if (not text) or (not number) or (not name) then
            print("❗ Invalid message format received from WebSocket server")
            return
        end

        if number == lastMessageTime then -- Ignore duplicate messages
            return
        end

        color = Color(r, g, b)
        net.Start("chatRelay")
        net.WriteString(text)
        net.WriteColor(color)
        net.WriteString(name)
        net.Broadcast()
        lastMessageTime = number
    end
end

hook.Add("PlayerSay", "ChatRelay", function(ply, text)
    if not IsValid(ply) or ply:IsBot() then return end
    local time = os.time() * 1000 -- Convert to milliseconds
    wsRelay:send("sendMessage", string.format("%s,%d,%s", text, time, ply:Name()))
end)

hook.Add("PlayerInitialSpawn", "ChatRelay", function(ply)
    if not IsValid(ply) or ply:IsBot() then return end
    wsRelay:send("sendMessage", string.format("%s,%d,%s", "has joined!", 0, ply:Name()))
end)

hook.Add("PlayerDisconnected", "ChatRelay", function(ply)
    if not IsValid(ply) or ply:IsBot() then return end
    wsRelay:send("sendMessage", string.format("%s,%d,%s", "has left", 0, ply:Name()))
end)