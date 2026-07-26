import openpyxl

wb = openpyxl.Workbook()
ws = wb.active
ws.title = "题库"

headers = ["科目", "题型", "专业大类", "题干", "选项A", "选项B", "选项C", "选项D", "正确答案", "解析"]
ws.append(headers)

# Subject A: 30 single, 20 multiple, 15 judge
for i in range(1, 31):
    ws.append(["A", "单选题", "", "科目A单选题第%d题：检验检测相关法律法规基础知识测试。" % i,
               "选项A的内容%d" % i, "选项B的内容%d" % i, "选项C的内容%d" % i, "选项D的内容%d" % i,
               "A", "这是第%d题的解析说明" % i])
for i in range(1, 21):
    ws.append(["A", "多选题", "", "科目A多选题第%d题：下列属于检验检测相关法律法规的有（）。" % i,
               "选项A内容", "选项B内容", "选项C内容", "选项D内容", "ABC", "解析说明"])
for i in range(1, 16):
    ws.append(["A", "判断题", "", "科目A判断题第%d题：检验检测机构应当遵守相关法律法规。" % i,
               "正确", "错误", "", "", "A", "解析说明"])

# Subject B: 20 single, 15 multiple, 10 judge
for i in range(1, 21):
    ws.append(["B", "单选题", "", "科目B单选题第%d题：质量管理基础知识测试。" % i,
               "选项A%d" % i, "选项B%d" % i, "选项C%d" % i, "选项D%d" % i, "B", "解析"])
for i in range(1, 16):
    ws.append(["B", "多选题", "", "科目B多选题第%d题：质量管理原则包括（）。" % i,
               "以顾客为关注焦点", "领导作用", "全员参与", "过程方法", "ABCD", "解析"])
for i in range(1, 11):
    ws.append(["B", "判断题", "", "科目B判断题第%d题：质量管理体系要求组织建立文件化的体系。" % i,
               "正确", "错误", "", "", "A", "解析"])

# Subject C: 15 single, 10 multiple, 10 judge
for i in range(1, 16):
    ws.append(["C", "单选题", "", "科目C单选题第%d题：检验检测通用技术基础测试。" % i,
               "选项A%d" % i, "选项B%d" % i, "选项C%d" % i, "选项D%d" % i, "C", "解析"])
for i in range(1, 11):
    ws.append(["C", "多选题", "", "科目C多选题第%d题：下列属于测量不确定度评定方法的有（）。" % i,
               "A类评定", "B类评定", "C类评定", "D类评定", "AB", "解析"])
for i in range(1, 11):
    ws.append(["C", "判断题", "", "科目C判断题第%d题：校准和检定是同一个概念。" % i,
               "正确", "错误", "", "", "B", "解析：校准和检定是不同的概念"])

# Subject D with categories
for cat in ["食品检测", "生态环境监测", "建材检测"]:
    for i in range(1, 26):
        ws.append(["D", "单选题", cat, "%s单选题第%d题：%s专业技术知识测试。" % (cat, i, cat),
                   "选项A%d" % i, "选项B%d" % i, "选项C%d" % i, "选项D%d" % i, "A", "解析"])
    for i in range(1, 26):
        ws.append(["D", "多选题", cat, "%s多选题第%d题：下列属于%s相关标准的有（）。" % (cat, i, cat),
                   "选项A", "选项B", "选项C", "选项D", "ABC", "解析"])
    for i in range(1, 16):
        ws.append(["D", "判断题", cat, "%s判断题第%d题：%s应遵循相关技术规范。" % (cat, i, cat),
                   "正确", "错误", "", "", "A", "解析"])

wb.save(r"C:\Users\A\WorkBuddy\Claw\exam-system\test_question_bank.xlsx")
total = ws.max_row - 1
print("Test question bank created: %d questions" % total)
