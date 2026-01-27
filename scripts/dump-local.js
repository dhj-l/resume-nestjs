const mongoose = require('mongoose');

async function fetchLocal() {
  await mongoose.connect('mongodb://localhost:27017/ai-resume');
  const col = mongoose.connection.db.collection('resumes');

  // 取前5份最丰富的
  const all = await col.find({ isTemplate: { $ne: true } }).toArray();
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

  const top5 = scored.slice(0, 5);
  const output = top5.map(r => ({
    title: r.title,
    type: r.type,
    basicInfo: r.basicInfo,
    jobIntention: r.jobIntention,
    educationBackground: r.educationBackground,
    workExperience: r.workExperience,
    projectExperience: r.projectExperience,
    internshipExperience: r.internshipExperience,
    campusExperience: r.campusExperience,
    skills: r.skills,
    selfEvaluation: r.selfEvaluation,
  }));

  console.log(JSON.stringify(output, null, 2));
  await mongoose.disconnect();
}
fetchLocal().catch(e => { console.error(e); process.exit(1); });
