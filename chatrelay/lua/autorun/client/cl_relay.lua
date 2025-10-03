local type = type
local function cleanString(str)
    return string.lower(string.replace(str, " ", ""))
end

local function isValidMessage(text, name)
    if not text or type(text) ~= "string" or text == "" then return false, "Invalid text" end
    if not name or type(name) ~= "string" or name == "" then return false, "Invalid name" end
    if string.len(text) > 200 then return false, "Text too long" end
    if string.len(name) > 32 then return false, "Name too long" end
    return true
end

local function replaceMentions(text, playerLookup)
    local formattedText = {}
    local lastPos = 1
    for startPos, mention in text:gmatch("()@([^%s]+)") do
        local endPos = startPos + #mention + 1
        if startPos > lastPos then table.insert(formattedText, string.sub(text, lastPos, startPos - 1)) end
        local matchFound = false
        for cleanName, ply in pairs(playerLookup) do
            if string.find(cleanName, cleanString(mention), 1, true) then
                table.insert(formattedText, Color(255, 221, 85))
                table.insert(formattedText, "@" .. ply:Nick())
                table.insert(formattedText, Color(255, 255, 255))
                if ply == LocalPlayer() then surface.PlaySound("Friends/message.wav") end
                matchFound = true
                break
            end
        end

        if not matchFound then table.insert(formattedText, "@" .. mention) end
        lastPos = endPos
    end

    if lastPos <= #text then table.insert(formattedText, string.sub(text, lastPos)) end
    return formattedText
end

net.Receive("chatRelay", function(len, ply)
    local text = net.ReadString()
    local color = net.ReadColor()
    local name = net.ReadString()
    local playerLookup = {}
    local suc, er = isValidMessage(text, name)
    if not suc then
        print("❗ Invalid message format received:", er, "(" .. ply:SteamID64() .. ")")
        return
    end

    for _, pl in player.Iterator() do
        playerLookup[cleanString(ply:Name())] = pl
    end

    local formattedText = replaceMentions(text, playerLookup)
    chat.AddText(Color(129, 129, 129), "[Discord Relay] ", color, " " .. name, Color(255, 255, 255), ": ", unpack(formattedText))
end)