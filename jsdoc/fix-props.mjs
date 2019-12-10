const matchProp = /((?:^|\n)(?:\/\*\*)?\s*\*\s*)@prop(?:erty)?(?:\s+({.+?}))(?:\s+([^*\s]+))(?=\s*(?:$|\*\/))/gm;
const matchOwner = /^\s*\*\s*@(class|typedef|const(?:ant)?|namespace|member(?:of)?)(?:\s+([^\n]+))\s*$/;

export const handlers = {
	jsdocCommentFound(event){
		event.comment = event.comment
			.replace(/\/\*\*((?:[^*]|\*[^/])+)\*\//g, (input, body) => {
				const tags = {};
				const doc = body
					.replace(/@example((?:[^*@]|(?=@\w|\*\/))*)/g, "")
					.replace(/{@link[^}]*}/g, "");
				for(const line of doc.replace(/\r?\n/g, "\n").split(/\n+/))
					if(matchProp.test(line))
						tags.property = RegExp.$1;
					else if(matchOwner.test(line)){
						tags.assigned = true;
						tags[RegExp.$1] = RegExp.$2;
					}
				if(tags.property && !tags.assigned)
					input = input.replace(matchProp, (_, before, type, name) =>
						`${before}@member ${type} ${name}\n * @instance`);
				return input;
			});
	},
};
