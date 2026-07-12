const util = require("util");
const fs = require("fs");

module.exports = async function responseApi(node, args, ctx) {
  if (!node) return
  if (node.type !== "llm") {
    throw Error(`response_api processor requires "llm" type got ${node.type}`);
  }

  return {
    ...node,
    exec: async (body, ctx) => {
      let payload = await node.exec(body, ctx);
      // return payload

      // console.log("before", payload)
      const b = JSON.parse(payload.body)
      // convert messages to input
      b.input = b.messages.reduce((memo, msg) => {
        if (msg.role == "assistant") {
          // const output = []
          // memo.push({ output });
          if (msg.content) {
            memo.push({ 
              role: "assistant", 
              type: "message",
              content: msg.content
            })
          }
          if (msg.tool_calls) {
            msg.tool_calls.forEach(tc => {
              memo.push({
                type: "function_call",
                call_id: tc.id,
                name: tc.function.name,
                arguments: tc.function.arguments
              })
            })
          }
        } else if (msg.role === "user") {
          memo.push({ 
            ...msg, 
            type: "message" 
          })
        } else if (msg.role === "tool") {
          memo.push({
            type: "function_call_output",
            call_id: msg.tool_call_id,
            output: [{
              type: "input_text",
              text: msg.content,
            }]
          })

        } else if (msg.role === "system") {
          b.instructions = (b.instructions || "") + "\n" + msg.content;
        }
        return memo
      }, [])
      if (b.tools) {
        b.tools = b.tools.map(tool => ({ type: "function", ...tool.function}) )
      }
      delete b.messages
      delete b.stream_options
      delete b.stream
      payload =  { 
        store: false, // do not store by default
        ...payload,
        url: "https://api.openai.com/v1/responses", 
        body: JSON.stringify(b)
      }
      // console.log("after", util.inspect(b, {depth: 6}));
      return payload
    },
    stream2result: (result, chunk, ctx) => {
      fs.appendFileSync("./log.fetch", JSON.stringify(result) + " ---  " + JSON.stringify(chunk) + "\n\n");
      return {
        role : "assistant",
        content: [ { output: [ { text: "hi"}] }]
      }
      //TODO:
    },
    result2msg: (result) => {
      // result this is what 
      // console.log("result", util.inspect(result, {depth: 6}));
      // return {
      //   role: "assistant",
      //   content: JSON.stringify(result, null, "  ")
      // }
      let msg = { 
        role: "assistant", 
        content: null,
      }
      result.output.forEach(output => {
        switch (output.type) {
          case "message":
            msg.content = output.content[0].text
            break;
          case "function_call":
            msg.tool_calls = msg.tool_calls || []
            msg.tool_calls.push({ 
              id: output.call_id,
              type: "function", 
              "function": {
                name: output.name,
                arguments: output.arguments
              }
            })
          break;
        }
      })
      // console.log("result2msg", msg)
      return msg 
    }
  }
}
