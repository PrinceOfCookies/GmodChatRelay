require("gwsockets")

local WebSocket = "ws://WSIP:PORT"
local disconnectionNotification = false

wsRelay = wsRelay or GWSockets.createWebSocket(WebSocket)

function wsRelay:onConnected()
    disconnectionNotification = true
    print("✅ Connected to WebSocket server")
end

function wsRelay:onDisconnected()
    if disconnectionNotification then
        print("⚠️ Disconnected from WebSocket server")
        disconnectionNotification = false
    end
end

function wsRelay:send(type, msg)
    if wsRelay:isConnected() then
        local jsonData = util.TableToJSON({
            type = type,
            payload = msg
        })

        wsRelay:write(jsonData)
    end
end

timer.Create("wsClientReconnect", 10, 0, function() if not wsRelay:isConnected() then wsRelay:open() end end)
wsRelay:open()