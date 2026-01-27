const mongoose = require('mongoose');

async function main() {
  await mongoose.connect('mongodb://localhost:27017/ai-resume');
  const col = mongoose.connection.db.collection('resumes');

  const total = await col.countDocuments({ isTemplate: { $ne: true } });
  console.log('非模板简历总数:', total);

  // 找内容最丰富的 5 份
  const all = await col.find({ isTemplate: { $ne: true } }).toArray();

  // 按内容丰富度排序
  const scored = all.map(r => ({
    ...r,
    _score: (r.workExperience?.length || 0) * 3
      + (r.projectExperience?.length || 0) * 2
      + (r.educationBackground?.length || 0) * 2
      + (r.skills?.content?.length || 0) / 50
      + (r.selfEvaluation?.content?.length || 0) / 50
      + (r.internshipExperience?.length || 0)
      + (r.campusExperience?.length || 0),
  })).sort((a, b) => b._score - a._score);

  console.log('\n得分最高的 5 份:');
  scored.slice(0, 5).forEach((r, i) => {
    console.log(`\n--- #${i + 1} score=${r._score.toFixed(1)} ---`);
    console.log('title:', r.title);
    console.log('type:', r.type);
    console.log('basicInfo:', JSON.stringify(r.basicInfo));
    console.log('jobIntention:', JSON.stringify(r.jobIntention));
    console.log('educationBackground:', r.educationBackground?.length, '条');
    console.log('workExperience:', r.workExperience?.length, '条');
    console.log('projectExperience:', r.projectExperience?.length, '条');
    console.log('internship:', r.internshipExperience?.length, '条');
    console.log('campus:', r.campusExperience?.length, '条');
    console.log('skills length:', r.skills?.content?.length || 0);
    console.log('selfEval length:', r.selfEvaluation?.content?.length || 0);
  });

  // 输出最丰富的那份的完整数据
  const best = scored[0];
  console.log('\n\n===== 最丰富简历完整数据 =====');
  const out = {
    title: best.title,
    type: best.type,
    basicInfo: best.basicInfo,
    jobIntention: best.jobIntention,
    educationBackground: best.educationBackground,
    workExperience: best.workExperience,
    projectExperience: best.projectExperience,
    internshipExperience: best.internshipExperience,
    campusExperience: best.campusExperience,
    skills: best.skills,
    certificates: best.certificates,
    selfEvaluation: best.selfEvaluation,
  };
  console.log(JSON.stringify(out, null, 2));

  await mongoose.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
